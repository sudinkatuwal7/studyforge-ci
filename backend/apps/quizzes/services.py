import os
import random

from django.db import transaction

from apps.quizzes.llm import get_client
from apps.quizzes.models import Question, Quiz
from apps.quizzes.selectors import build_source_text

# Small enough that a 10-question quiz comes back inside the 15-second
# target (SCRUM-27). Overridable so sampling can be exercised in tests.
DEFAULT_SOURCE_CHAR_LIMIT = 60_000


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
