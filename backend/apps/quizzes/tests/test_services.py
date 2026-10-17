import random
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.quizzes.llm import LLMError
from apps.quizzes.llm.fake import FakeQuizLLM
from apps.quizzes.models import Quiz
from apps.quizzes.selectors import build_source_text
from apps.quizzes.services import EmptyDocumentError, generate_quiz


class QuizServiceTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=self.user, name="CS 3358")

    def make_document(self, title, pages=()):
        document = Document.objects.create(
            owner=self.user,
            course=self.course,
            title=title,
            sha256="a" * 64,
            file=f"documents/2026/10/{title}.pdf",
            status=Document.Status.READY,
            page_count=max(len(pages), 1),
        )
        for page_number, content in enumerate(pages, start=1):
            Chunk.objects.create(
                owner=self.user, document=document, page_number=page_number, content=content
            )
        return document


class GenerateQuizTests(QuizServiceTestCase):
    def test_saves_quiz_and_questions_in_order(self):
        documents = [
            self.make_document("Lecture 3", ["Normalization removes redundancy."]),
            self.make_document("Lecture 4", ["Indexes speed up lookups."]),
        ]

        quiz = generate_quiz(self.user, self.course, documents, 10)

        self.assertEqual(quiz.owner, self.user)
        self.assertEqual(quiz.course, self.course)
        self.assertEqual(quiz.title, "Quiz: Lecture 3, Lecture 4")
        self.assertQuerySetEqual(quiz.source_documents.order_by("pk"), documents)
        self.assertEqual(
            list(quiz.questions.values_list("position", flat=True)), list(range(1, 11))
        )
        for question in quiz.questions.all():
            question.full_clean()

    def test_shuffle_keeps_the_correct_answer(self):
        document = self.make_document("Lecture 3", ["Some content."])

        quiz = generate_quiz(self.user, self.course, [document], 10, rng=random.Random(7))

        for question in quiz.questions.all():
            self.assertEqual(
                question.options[question.correct_option_index], f"Correct {question.position}"
            )
        # The fake always puts the answer first; with a seeded shuffle at
        # least one should have moved.
        self.assertTrue(any(q.correct_option_index != 0 for q in quiz.questions.all()))

    def test_long_title_is_truncated_to_fit(self):
        documents = [self.make_document("x" * 200, ["a"]), self.make_document("y" * 200, ["b"])]

        quiz = generate_quiz(self.user, self.course, documents, 5)

        self.assertEqual(len(quiz.title), 255)

    def test_document_without_text_is_rejected_before_calling_the_model(self):
        good = self.make_document("Lecture 3", ["Some content."])
        empty = self.make_document("Scanned handout")
        client = mock.Mock()

        with self.assertRaises(EmptyDocumentError) as ctx:
            generate_quiz(self.user, self.course, [good, empty], 5, client=client)

        self.assertEqual(ctx.exception.document_ids, [empty.pk])
        client.generate.assert_not_called()
        self.assertFalse(Quiz.objects.exists())

    def test_model_failure_saves_nothing(self):
        document = self.make_document("Lecture 3", ["Some content."])
        client = mock.Mock()
        client.generate.side_effect = LLMError("down")

        with self.assertRaises(LLMError):
            generate_quiz(self.user, self.course, [document], 5, client=client)

        self.assertFalse(Quiz.objects.exists())

    def test_model_receives_the_selected_text_and_count(self):
        document = self.make_document("Lecture 3", ["Normalization removes redundancy."])
        client = mock.Mock(wraps=FakeQuizLLM())

        generate_quiz(self.user, self.course, [document], 5, client=client)

        text, count = client.generate.call_args.args
        self.assertIn("Normalization removes redundancy.", text)
        self.assertIn("## Lecture 3", text)
        self.assertEqual(count, 5)


class BuildSourceTextTests(QuizServiceTestCase):
    def test_short_documents_are_sent_whole_with_page_labels(self):
        document = self.make_document("Lecture 3", ["Page one.", "Page two."])

        text, empty_ids = build_source_text([document], 10_000)

        self.assertEqual(empty_ids, [])
        self.assertIn("[Page 1]\nPage one.", text)
        self.assertIn("[Page 2]\nPage two.", text)

    def test_long_documents_are_sampled_across_all_pages(self):
        pages = [f"Page {n} " + "x" * 90 for n in range(1, 101)]
        document = self.make_document("Long reading", pages)

        text, _ = build_source_text([document], 2_000)

        self.assertLessEqual(len(text), 2_000 + len("## Long reading\n\n"))
        self.assertIn("[Page 1]", text)
        # Sampled from across the document, not just the opening pages.
        self.assertIn("[Page 61]", text)

    def test_budget_is_shared_so_one_document_cannot_crowd_out_another(self):
        long = self.make_document("Long reading", ["x" * 5_000] * 10)
        short = self.make_document("Short lecture", ["Short lecture content."])

        text, _ = build_source_text([long, short], 4_000)

        self.assertIn("Short lecture content.", text)
