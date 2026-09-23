from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.documents.models import Document


class StudyGuideEndpointTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.client.force_authenticate(user=self.user)

    def test_ready_document_returns_structured_response(self):
        document = Document.objects.create(...)  # a READY document owned by self.user
        response = self.client.post(
            f"/api/v1/documents/{document.id}/study-guide/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("key_concepts", response.data)
        self.assertIn("important_points", response.data)
        self.assertIn("summary", response.data)