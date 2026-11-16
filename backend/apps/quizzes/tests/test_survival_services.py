import random

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.quizzes.llm import LLMError
from apps.quizzes.llm.fake import FakeQuizLLM
from apps.quizzes.models import (
    Question,
    Quiz,
    QuizSubmission,
    SurvivalAnswer,
    SurvivalSession,
)
from apps.quizzes.services import (
    InvalidOptionError,
    QuestionNotCurrentError,
    SurvivalSessionEndedError,
    answer_survival_question,
    start_survival_session,
)


class SurvivalServiceTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.session = self.make_session(num_questions=5)
        self.questions = list(self.session.quiz.questions.all())

    def make_session(self, num_questions):
        quiz = Quiz.objects.create(owner=self.user, course=self.course, title="Survival")
        Question.objects.bulk_create(
            Question(
                quiz=quiz,
                position=n,
                text=f"Question {n}?",
                options=["A", "B", "C", "D"],
                correct_option_index=n % 4,
                explanation=f"Because {n}.",
            )
            for n in range(1, num_questions + 1)
        )
        return SurvivalSession.objects.create(quiz=quiz)

    def answer(self, question, correct, session=None):
        index = question.correct_option_index
        if not correct:
            index = (index + 1) % len(question.options)
        return answer_survival_question((session or self.session).pk, question.pk, index)

    def play(self, *results):
        """Answer questions in order: True for right, False for wrong."""
        for question, correct in zip(self.questions, results):
            self.answer(question, correct)
        self.session.refresh_from_db()


class AnswerSurvivalQuestionTests(SurvivalServiceTestCase):
    def test_correct_answer_adds_to_score_and_keeps_lives(self):
        answer = self.answer(self.questions[0], correct=True)
        self.session.refresh_from_db()

        self.assertTrue(answer.is_correct)
        self.assertEqual((self.session.score, self.session.lives), (1, 3))
        self.assertEqual(self.session.current_position, 2)

    def test_wrong_answer_removes_one_life_and_moves_on(self):
        answer = self.answer(self.questions[0], correct=False)
        self.session.refresh_from_db()

        self.assertFalse(answer.is_correct)
        self.assertEqual((self.session.score, self.session.lives), (0, 2))
        self.assertEqual(self.session.current_position, 2)

    def test_game_over_at_zero_lives(self):
        self.play(True, False, False, False)

        self.assertEqual(self.session.status, SurvivalSession.Status.GAME_OVER)
        self.assertEqual((self.session.score, self.session.lives), (1, 0))
        self.assertIsNotNone(self.session.ended_at)
        # The game stops on the question that ended it.
        self.assertEqual(self.session.current_position, 4)

    def test_completed_after_the_last_question_with_lives_left(self):
        self.play(True, False, True, True, False)

        self.assertEqual(self.session.status, SurvivalSession.Status.COMPLETED)
        self.assertEqual((self.session.score, self.session.lives), (3, 1))
        self.assertIsNotNone(self.session.ended_at)

    def test_losing_the_last_life_on_the_last_question_is_game_over(self):
        self.session = self.make_session(num_questions=3)
        self.questions = list(self.session.quiz.questions.all())

        self.play(False, False, False)

        self.assertEqual(self.session.status, SurvivalSession.Status.GAME_OVER)

    def test_answers_after_the_game_ends_are_rejected(self):
        self.play(False, False, False)

        with self.assertRaises(SurvivalSessionEndedError):
            self.answer(self.questions[3], correct=True)
        self.assertEqual(SurvivalAnswer.objects.count(), 3)

    def test_answering_a_question_that_is_not_current_changes_nothing(self):
        with self.assertRaises(QuestionNotCurrentError):
            self.answer(self.questions[1], correct=False)

        self.session.refresh_from_db()
        self.assertEqual((self.session.lives, self.session.current_position), (3, 1))
        self.assertFalse(SurvivalAnswer.objects.exists())

    def test_the_same_question_cannot_be_answered_twice(self):
        self.answer(self.questions[0], correct=False)

        with self.assertRaises(QuestionNotCurrentError):
            self.answer(self.questions[0], correct=False)
        self.session.refresh_from_db()
        self.assertEqual(self.session.lives, 2)

    def test_a_question_from_another_session_is_not_current(self):
        other = self.make_session(num_questions=5)

        with self.assertRaises(QuestionNotCurrentError):
            self.answer(other.quiz.questions.first(), correct=True)

    def test_option_out_of_range_costs_no_life(self):
        with self.assertRaises(InvalidOptionError):
            answer_survival_question(self.session.pk, self.questions[0].pk, 4)

        self.session.refresh_from_db()
        self.assertEqual(self.session.lives, 3)
        self.assertFalse(SurvivalAnswer.objects.exists())


class SurvivalResultTests(SurvivalServiceTestCase):
    def test_nothing_is_saved_to_history_while_the_game_is_running(self):
        self.play(True, False)

        self.assertFalse(QuizSubmission.objects.exists())

    def test_game_over_saves_the_result_with_unreached_questions_unanswered(self):
        self.play(True, False, False, False)

        submission = QuizSubmission.objects.get(quiz=self.session.quiz)
        self.assertEqual((submission.score, submission.total_questions), (1, 5))
        self.assertEqual(
            [(a.question_id, a.is_correct) for a in submission.answers.all()],
            [(q.pk, c) for q, c in zip(self.questions, (True, False, False, False, False))],
        )
        self.assertIsNone(submission.answers.get(question=self.questions[4]).selected_option_index)

    def test_completed_game_saves_every_answer(self):
        self.play(True, True, False, True, True)

        submission = QuizSubmission.objects.get(quiz=self.session.quiz)
        self.assertEqual((submission.score, submission.total_questions), (4, 5))
        self.assertEqual(
            [a.selected_option_index for a in submission.answers.all()],
            [a.selected_option_index for a in self.session.answers.all()],
        )


class StartSurvivalSessionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.document = Document.objects.create(
            owner=self.user,
            course=self.course,
            title="Lecture 3",
            sha256="a" * 64,
            file="documents/2026/10/lecture-3.pdf",
            status=Document.Status.READY,
            page_count=1,
        )
        Chunk.objects.create(
            owner=self.user, document=self.document, page_number=1, content="Content."
        )

    def test_creates_a_new_quiz_and_an_active_session(self):
        session = start_survival_session(
            self.user, self.course, [self.document], 10, client=FakeQuizLLM(), rng=random.Random(0)
        )

        self.assertTrue(session.is_active)
        self.assertEqual(session.quiz.owner, self.user)
        self.assertEqual(session.quiz.course, self.course)
        self.assertEqual(session.quiz.questions.count(), 10)

    def test_generation_failure_creates_nothing(self):
        class FailingLLM:
            def generate(self, text, num_questions):
                raise LLMError("down")

        with self.assertRaises(LLMError):
            start_survival_session(self.user, self.course, [self.document], 5, client=FailingLLM())

        self.assertFalse(Quiz.objects.exists())
        self.assertFalse(SurvivalSession.objects.exists())
