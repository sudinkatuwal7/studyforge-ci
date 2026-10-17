from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.urls import reverse

from apps.courses.models import Course
from apps.documents.models import Document, Job


class InternalJobDocumentViewTests(TransactionTestCase):
    def setUp(self):
        owner = get_user_model().objects.create(email="internal-pdf@example.test")
        course = Course.objects.create(owner=owner, name="Internal PDF")
        document = Document.objects.create(
            owner=owner,
            course=course,
            title="lecture.pdf",
            sha256="a" * 64,
            file="documents/lecture.pdf",
        )
        self.job = Job.objects.create(document=document)

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_authorized_request_streams_pdf_with_correlation_headers(self):
        with patch(
            "django.db.models.fields.files.FieldFile.open",
            return_value=BytesIO(b"%PDF-1.4 test"),
        ):
            response = self.client.get(
                reverse("internal-job-document", args=[self.job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response["X-Document-ID"], str(self.job.document_id))
        self.assertEqual(response["X-Source-SHA256"], "a" * 64)
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 test")

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_missing_or_incorrect_token_is_rejected(self):
        url = reverse("internal-job-document", args=[self.job.pk])
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(
            self.client.get(url, HTTP_AUTHORIZATION="Bearer wrong-token").status_code,
            401,
        )

    @override_settings(PROCESSING_SERVICE_TOKEN="")
    def test_missing_server_token_fails_closed(self):
        response = self.client.get(
            reverse("internal-job-document", args=[self.job.pk]),
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": "service_unavailable"})

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_unknown_job_is_not_found(self):
        response = self.client.get(
            reverse("internal-job-document", args=[999999]),
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_non_get_methods_are_rejected(self):
        response = self.client.post(
            reverse("internal-job-document", args=[self.job.pk]),
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )
        self.assertEqual(response.status_code, 405)

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_file_open_error_is_reported_as_unavailable(self):
        with patch(
            "django.db.models.fields.files.FieldFile.open",
            side_effect=OSError("storage offline"),
        ):
            response = self.client.get(
                reverse("internal-job-document", args=[self.job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": "source_unavailable"})
