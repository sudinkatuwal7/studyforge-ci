from unittest import skipIf

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.courses.models import Course
from apps.documents.models import Document

try:
    from apps.knowledge.models import Chunk
except ImportError:  # pragma: no cover
    # SCRUM-17 has not merged to development yet. Tests that need real
    # chunk rows skip until it does; the rest still run.
    Chunk = None


class StudyGuideEndpointTests(APITestCase):
    """POST /api/v1/documents/{document_id}/study-guide/"""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu",
            password="TestPassword123!",
        )
        self.client.force_authenticate(user=self.user)

        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.document = Document.objects.create(
            owner=self.user,
            course=self.course,
            title="Lecture 07",
            sha256="a" * 64,
            file="documents/2026/09/lecture07.pdf",
            status=Document.Status.READY,
            page_count=12,
        )
        self.url = f"/api/v1/documents/{self.document.pk}/study-guide/"

    @skipIf(Chunk is None, "Needs the Chunk model from SCRUM-17 (not merged yet)")
    def test_ready_document_returns_structured_response(self):
        Chunk.objects.create(
            owner=self.user,
            document=self.document,
            page_number=1,
            content="Normalization organises tables to remove redundant data.",
        )

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("key_concepts", body)
        self.assertIn("important_points", body)
        self.assertIn("summary", body)
        self.assertTrue(body["key_concepts"])
        self.assertTrue(body["summary"])

    @skipIf(Chunk is None, "Needs the Chunk model from SCRUM-17 (not merged yet)")
    def test_ready_document_with_no_chunks_returns_409(self):
        """READY but empty: a scanned PDF, or extraction that found nothing.
        Distinct from DOCUMENT_NOT_READY, which means 'come back later'."""
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_HAS_NO_TEXT")

    def test_other_users_document_returns_404(self):
        """404 rather than 403, so the API never confirms that another
        student's document exists."""
        other_user = get_user_model().objects.create_user(
            email="someone-else@example.edu",
            password="TestPassword123!",
        )
        other_course = Course.objects.create(owner=other_user, name="CS 3354")
        other_document = Document.objects.create(
            owner=other_user,
            course=other_course,
            title="Not yours",
            sha256="b" * 64,
            file="documents/2026/09/other.pdf",
            status=Document.Status.READY,
            page_count=4,
        )

        response = self.client.post(
            f"/api/v1/documents/{other_document.pk}/study-guide/"
        )

        self.assertEqual(response.status_code, 404)

    def test_document_not_ready_returns_409(self):
        self.document.status = Document.Status.PROCESSING
        self.document.save(update_fields=["status"])

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_NOT_READY")

    def test_unauthenticated_request_is_rejected(self):
        """The project's DRF default is AllowAny, so this endpoint's
        permission_classes are the only thing keeping it private."""
        self.client.force_authenticate(user=None)

        response = self.client.post(self.url)

        self.assertIn(response.status_code, (401, 403))