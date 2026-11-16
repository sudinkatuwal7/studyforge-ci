import os
import random

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.quizzes.llm import get_client
from apps.quizzes.models import (
    Question,
    Quiz,
    QuizSubmission,
    SubmittedAnswer,
    SurvivalAnswer,
    SurvivalSession,
    SurvivalStatus,
)
from apps.quizzes.selectors import build_source_text

# Small enough that a 10-question quiz comes back inside the 15-second
# target (SCRUM-27). Overridable so sampling can be exercised in tests.
DEFAULT_SOURCE_CHAR_LIMIT = 60_000


class AlreadySubmittedError(Exception):
    """The quiz already has a submission; answers cannot be changed."""


class SurvivalSessionEndedError(Exception):
    """The game is over; no more answers are accepted."""


class QuestionNotCurrentError(Exception):
    """The answer names a question other than the one being asked: a
    double click, a retry, or a stale tab."""


class InvalidOptionError(Exception):
    """The selected option does not exist on the current question."""


class EmptyDocumentError(Exception):
    """A selected READY document produced no usable text."""

    def __init__(self, document_ids):
        super().__init__(f"No readable text in documents {document_ids}")
        self.document_ids = document_ids


def _shuffle_options(question, rng):
    """Shuffle the options and move the answer index with them.

    Models put the correct answer first far more often than chance, so a
    student could learn to pick A. The shuffle removes that pattern.
    """
    order = list(range(len(question["options"])))
    rng.shuffle(order)
    return {
        **question,
        "options": [question["options"][i] for i in order],
        "correct_option_index": order.index(question["correct_option_index"]),
    }


def _build_title(documents):
    title = "Quiz: " + ", ".join(document.title for document in documents)
    max_length = Quiz._meta.get_field("title").max_length
    return title if len(title) <= max_length else title[: max_length - 1] + "…"


def generate_quiz(owner, course, documents, num_questions, client=None, rng=None):
    """Generate and save a quiz from documents the caller has already
    checked are owned, in `course`, and READY.

    `client` and `rng` can be injected so tests control the model output
    and the shuffle.
    """
    limit = int(os.environ.get("QUIZ_SOURCE_CHAR_LIMIT", DEFAULT_SOURCE_CHAR_LIMIT))
    text, empty_ids = build_source_text(documents, limit)
    if empty_ids:
        raise EmptyDocumentError(empty_ids)

    # The model call happens before the transaction opens: a 5-10 second
    # network call must not hold a database connection in a transaction.
    result = (client or get_client()).generate(text, num_questions)
    rng = rng or random.Random()

    with transaction.atomic():
        quiz = Quiz.objects.create(owner=owner, course=course, title=_build_title(documents))
        quiz.source_documents.set(documents)
        Question.objects.bulk_create(
            Question(quiz=quiz, position=position, **_shuffle_options(question, rng))
            for position, question in enumerate(result["questions"], start=1)
        )
    return quiz


def submit_quiz(quiz, answers):
    """Grade and save a quiz's final answers.

    `answers` is validated SubmitQuizSerializer data: every question in
    `quiz` exactly once, each index null or in range. Grading happens here,
    against the stored answer key, so nothing the client sends can affect
    the score except the chosen options.
    """
    questions = {question.pk: question for question in quiz.questions.all()}
    graded = [
        SubmittedAnswer(
            question=questions[answer["question_id"]],
            selected_option_index=answer["selected_option_index"],
            is_correct=answer["selected_option_index"]
            == questions[answer["question_id"]].correct_option_index,
        )
        for answer in answers
    ]

    try:
        with transaction.atomic():
            submission = QuizSubmission.objects.create(
                quiz=quiz,
                score=sum(answer.is_correct for answer in graded),
                total_questions=len(graded),
            )
            for answer in graded:
                answer.submission = submission
            SubmittedAnswer.objects.bulk_create(graded)
    except IntegrityError as exc:
        # Two submits racing (a double click, two tabs): the one-per-quiz
        # constraint lets exactly one through.
        raise AlreadySubmittedError from exc
    return submission


def start_survival_session(owner, course, documents, num_questions, client=None, rng=None):
    """Generate a fresh quiz and start a Survival game on it.

    A new quiz every time, so no question in the game has had its answer
    revealed. The session is saved just after the quiz, not in the same
    transaction: generate_quiz calls the model first, and holding a
    transaction open across that call would tie up a database connection.
    If this second save failed, the quiz would be left unused, and nobody
    holds its id.
    """
    quiz = generate_quiz(owner, course, documents, num_questions, client=client, rng=rng)
    return SurvivalSession.objects.create(quiz=quiz)


def answer_survival_question(session_id, question_id, selected_option_index):
    """Grade one answer and move the game on. Returns the saved answer.

    The session row is locked for the whole update, so two answers sent at
    once are handled one after the other: the second sees the game has
    moved on and gets QuestionNotCurrentError. Everything is graded
    against the stored answer key; the client only chooses the option.
    """
    with transaction.atomic():
        session = SurvivalSession.objects.select_for_update().get(pk=session_id)
        if not session.is_active:
            raise SurvivalSessionEndedError

        questions = list(Question.objects.filter(quiz_id=session.quiz_id))
        current = next(q for q in questions if q.position == session.current_position)
        if question_id != current.pk:
            raise QuestionNotCurrentError
        if selected_option_index >= len(current.options):
            raise InvalidOptionError

        answer = SurvivalAnswer.objects.create(
            session=session,
            question=current,
            selected_option_index=selected_option_index,
            is_correct=selected_option_index == current.correct_option_index,
        )

        if answer.is_correct:
            session.score += 1
        else:
            session.lives -= 1

        # Running out of lives wins over running out of questions: a wrong
        # last answer on the last life is a loss.
        if session.lives == 0:
            _end_survival_session(session, SurvivalStatus.GAME_OVER, questions)
        elif current.position == len(questions):
            _end_survival_session(session, SurvivalStatus.COMPLETED, questions)
        else:
            session.current_position += 1
        session.save()
    return answer


def _end_survival_session(session, status, questions):
    """Close the game and save it as an ordinary graded submission, so
    quiz history and the results endpoint need no Survival-specific code.

    Questions never reached are saved as unanswered (null), which counts
    as incorrect, the same rule a regular quiz uses.
    """
    session.status = status
    session.ended_at = timezone.now()

    answered = {answer.question_id: answer for answer in session.answers.all()}
    submission = QuizSubmission.objects.create(
        quiz_id=session.quiz_id,
        score=session.score,
        total_questions=len(questions),
    )
    SubmittedAnswer.objects.bulk_create(
        SubmittedAnswer(
            submission=submission,
            question=question,
            selected_option_index=(
                answered[question.pk].selected_option_index if question.pk in answered else None
            ),
            is_correct=question.pk in answered and answered[question.pk].is_correct,
        )
        for question in questions
    )
