from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.courses.models import Course
from apps.documents.models import Document


class StudyGuideEndpointTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
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

    def test_ready_document_returns_structured_response(self):
        response = self.client.post(
            f"/api/v1/documents/{self.document.id}/study-guide/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("key_concepts", response.data)
        self.assertIn("important_points", response.data)
        self.assertIn("summary", response.data)

    def test_other_users_document_returns_404(self):
        stranger = get_user_model().objects.create_user(
            email="other@example.edu", password="TestPassword123!"
        )
        self.client.force_authenticate(user=stranger)
        response = self.client.post(
            f"/api/v1/documents/{self.document.id}/study-guide/"
        )
        self.assertEqual(response.status_code, 404)

    def test_document_not_ready_returns_409(self):
        self.document.status = Document.Status.PENDING
        self.document.save(update_fields=["status"])
        response = self.client.post(
            f"/api/v1/documents/{self.document.id}/study-guide/"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "DOCUMENT_NOT_READY")