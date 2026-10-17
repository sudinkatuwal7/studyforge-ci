from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.quizzes.llm import LLMError
from apps.quizzes.models import Quiz

HIDDEN_FIELDS = ("correct_option_index", "explanation")


class QuizEndpointTestCase(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.other = get_user_model().objects.create_user(
            email="other@example.edu", password="TestPassword123!"
        )
        self.client.force_authenticate(user=self.user)
        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.document = self.make_document(self.user, self.course, "Lecture 3")
        self.url = f"/api/v1/courses/{self.course.pk}/quizzes/"

    def make_document(self, owner, course, title, status=Document.Status.READY, text="Content."):
        document = Document.objects.create(
            owner=owner,
            course=course,
            title=title,
            sha256="a" * 64,
            file=f"documents/2026/10/{title}.pdf",
            status=status,
            page_count=1,
        )
        if text:
            Chunk.objects.create(owner=owner, document=document, page_number=1, content=text)
        return document

    def post(self, document_ids=None, num_questions=5, url=None):
        body = {
            "document_ids": [self.document.pk] if document_ids is None else document_ids,
            "num_questions": num_questions,
        }
        return self.client.post(url or self.url, body, format="json")

    def assert_answers_hidden(self, body):
        for question in body["questions"]:
            for field in HIDDEN_FIELDS:
                self.assertNotIn(field, question)


class GenerateQuizEndpointTests(QuizEndpointTestCase):
    """POST /api/v1/courses/{course_id}/quizzes/"""

    def test_generates_5_and_10_question_quizzes(self):
        for count in (5, 10):
            with self.subTest(count=count):
                response = self.post(num_questions=count)

                self.assertEqual(response.status_code, 201)
                body = response.json()
                self.assertEqual(len(body["questions"]), count)
                self.assertEqual(body["course"], self.course.pk)
                self.assertEqual(body["source_documents"], [self.document.pk])
                self.assertEqual(Quiz.objects.get(pk=body["id"]).questions.count(), count)

    def test_accepts_multiple_documents(self):
        second = self.make_document(self.user, self.course, "Lecture 4")

        response = self.post([self.document.pk, second.pk])

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], "Quiz: Lecture 3, Lecture 4")

    def test_correct_answers_are_hidden(self):
        response = self.post()

        self.assertEqual(response.status_code, 201)
        self.assert_answers_hidden(response.json())
        self.assertEqual(
            set(response.json()["questions"][0]), {"id", "position", "text", "options"}
        )

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        self.assertIn(self.post().status_code, (401, 403))
        self.assertFalse(Quiz.objects.exists())

    def test_other_users_course_returns_404(self):
        course = Course.objects.create(owner=self.other, name="Not mine")
        document = self.make_document(self.other, course, "Their notes")

        response = self.post([document.pk], url=f"/api/v1/courses/{course.pk}/quizzes/")

        self.assertEqual(response.status_code, 404)

    def test_other_users_document_returns_404(self):
        course = Course.objects.create(owner=self.other, name="Not mine")
        document = self.make_document(self.other, course, "Their notes")

        response = self.post([self.document.pk, document.pk])

        self.assertEqual(response.status_code, 404)
        self.assertFalse(Quiz.objects.exists())

    def test_document_from_another_of_my_courses_returns_404(self):
        """One quiz belongs to one course, so every material must be in it."""
        other_course = Course.objects.create(owner=self.user, name="CS 4332")
        document = self.make_document(self.user, other_course, "Other course lecture")

        response = self.post([self.document.pk, document.pk])

        self.assertEqual(response.status_code, 404)

    def test_nonexistent_document_returns_404(self):
        self.assertEqual(self.post([999_999]).status_code, 404)

    def test_invalid_requests_return_400(self):
        cases = {
            "empty selection": {"document_ids": [], "num_questions": 5},
            "duplicate ids": {"document_ids": [self.document.pk] * 2, "num_questions": 5},
            "missing ids": {"num_questions": 5},
            "unsupported length": {"document_ids": [self.document.pk], "num_questions": 7},
            "missing length": {"document_ids": [self.document.pk]},
            "too many documents": {"document_ids": list(range(1, 22)), "num_questions": 5},
        }
        for name, body in cases.items():
            with self.subTest(name):
                response = self.client.post(self.url, body, format="json")
                self.assertEqual(response.status_code, 400)
        self.assertFalse(Quiz.objects.exists())

    def test_document_not_ready_returns_409(self):
        for status in (Document.Status.PENDING, Document.Status.PROCESSING, Document.Status.FAILED):
            with self.subTest(status=status):
                document = self.make_document(self.user, self.course, f"Doc {status}", status=status)

                response = self.post([self.document.pk, document.pk])

                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["code"], "DOCUMENT_NOT_READY")
                self.assertEqual(response.json()["document_ids"], [document.pk])
        self.assertFalse(Quiz.objects.exists())

    def test_ready_document_without_text_returns_409(self):
        empty = self.make_document(self.user, self.course, "Scanned", text="")

        response = self.post([self.document.pk, empty.pk])

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_HAS_NO_TEXT")
        self.assertEqual(response.json()["document_ids"], [empty.pk])

    def test_model_failure_returns_503_and_saves_nothing(self):
        client = mock.Mock()
        client.generate.side_effect = LLMError("OpenAI is down")

        with mock.patch("apps.quizzes.services.get_client", return_value=client):
            response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "QUIZ_GENERATION_FAILED")
        self.assertNotIn("OpenAI", response.json()["detail"])
        self.assertFalse(Quiz.objects.exists())


class QuizDetailEndpointTests(QuizEndpointTestCase):
    """GET /api/v1/quizzes/{quiz_id}/"""

    def test_owner_can_reload_quiz_without_answers(self):
        quiz_id = self.post().json()["id"]

        response = self.client.get(f"/api/v1/quizzes/{quiz_id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["questions"]), 5)
        self.assert_answers_hidden(response.json())

    def test_other_users_quiz_returns_404(self):
        quiz_id = self.post().json()["id"]
        self.client.force_authenticate(user=self.other)

        self.assertEqual(self.client.get(f"/api/v1/quizzes/{quiz_id}/").status_code, 404)
