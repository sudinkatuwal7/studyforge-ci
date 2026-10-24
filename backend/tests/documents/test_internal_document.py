from hashlib import sha256
from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
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
    def test_each_job_streams_only_its_associated_document(self):
        other_owner = get_user_model().objects.create(email="other-internal-pdf@example.test")
        other_course = Course.objects.create(owner=other_owner, name="Other internal PDF")
        other_document = Document.objects.create(
            owner=other_owner,
            course=other_course,
            title="other.pdf",
            sha256="b" * 64,
        )
        other_job = Job.objects.create(document=other_document)
        sources = (
            (self.job, b"%PDF-1.4 first private source"),
            (other_job, b"%PDF-1.4 second private source"),
        )
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            for job, content in sources:
                document = job.document
                document.sha256 = sha256(content).hexdigest()
                document.file.save(f"job-{job.pk}.pdf", ContentFile(content))

            for job, content in sources:
                with self.subTest(job_id=job.pk):
                    response = self.client.get(
                        reverse("internal-job-document", args=[job.pk]),
                        HTTP_AUTHORIZATION="Bearer test-service-token",
                    )
                    try:
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response["Content-Type"], "application/pdf")
                        self.assertEqual(response["X-Document-ID"], str(job.document_id))
                        self.assertEqual(response["X-Source-SHA256"], sha256(content).hexdigest())
                        self.assertEqual(response["Cache-Control"], "no-store")
                        self.assertEqual(b"".join(response.streaming_content), content)
                    finally:
                        response.close()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_invalid_credentials_are_rejected_before_lookup_or_storage_access(self):
        url = reverse("internal-job-document", args=[self.job.pk])
        for authorization in (None, "Bearer wrong-token"):
            with self.subTest(authorization=authorization), patch(
                "apps.documents.internal_views.Job.objects.select_related"
            ) as lookup, patch(
                "django.db.models.fields.files.FieldFile.open"
            ) as open_file:
                headers = {} if authorization is None else {"HTTP_AUTHORIZATION": authorization}
                with self.assertNumQueries(0):
                    response = self.client.get(url, **headers)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {"error": "unauthorized"})
                lookup.assert_not_called()
                open_file.assert_not_called()

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
        self.assertEqual(response.json(), {"error": "not_found"})

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_malformed_job_id_is_rejected_without_source_details(self):
        for job_id in ("not-an-id", "-1", "1.5", "１２", "9223372036854775808", "9" * 100):
            with self.subTest(job_id=job_id), patch(
                "apps.documents.internal_views.Job.objects.select_related"
            ) as lookup, patch("django.db.models.fields.files.FieldFile.open") as open_file:
                response = self.client.get(
                    reverse("internal-job-document", args=[job_id]),
                    HTTP_AUTHORIZATION="Bearer test-service-token",
                )
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json(), {"error": "not_found"})
                self.assertFalse(response.streaming)
                self.assertNotIn("X-Document-ID", response)
                self.assertNotIn("X-Source-SHA256", response)
                lookup.assert_not_called()
                open_file.assert_not_called()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_malformed_job_id_still_requires_service_authentication(self):
        with patch("apps.documents.internal_views.Job.objects.select_related") as lookup:
            for authorization in (None, "Bearer wrong-token"):
                with self.subTest(authorization=authorization):
                    headers = {} if authorization is None else {"HTTP_AUTHORIZATION": authorization}
                    response = self.client.get(
                        reverse("internal-job-document", args=["not-an-id"]), **headers
                    )
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.json(), {"error": "unauthorized"})
            lookup.assert_not_called()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_non_positive_job_id_is_rejected_before_lookup(self):
        with patch("apps.documents.internal_views.Job.objects.select_related") as lookup:
            response = self.client.get(
                reverse("internal-job-document", args=[0]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": "not_found"})
        lookup.assert_not_called()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_absent_file_name_is_not_found_before_storage_access(self):
        self.job.document.file = ""
        self.job.document.save(update_fields=["file"])
        with patch("django.db.models.fields.files.FieldFile.open") as open_file:
            response = self.client.get(
                reverse("internal-job-document", args=[self.job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": "not_found"})
        open_file.assert_not_called()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_missing_physical_file_is_reported_without_storage_path(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.get(
                reverse("internal-job-document", args=[self.job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": "source_unavailable"})
        self.assertNotIn(media_root, response.content.decode())

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_non_get_methods_are_rejected(self):
        response = self.client.post(
            reverse("internal-job-document", args=[self.job.pk]),
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )
        self.assertEqual(response.status_code, 405)

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_superseded_job_is_rejected_before_storage_access(self):
        Job.objects.create(document=self.job.document)
        with patch("django.db.models.fields.files.FieldFile.open") as open_file:
            response = self.client.get(
                reverse("internal-job-document", args=[self.job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {"error": "stale_job"})
        self.assertFalse(response.streaming)
        self.assertNotIn("X-Document-ID", response)
        self.assertNotIn("X-Source-SHA256", response)
        open_file.assert_not_called()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_latest_job_can_still_download_its_source(self):
        latest_job = Job.objects.create(document=self.job.document)
        content = b"%PDF-1.4 latest job source"
        with patch(
            "django.db.models.fields.files.FieldFile.open", return_value=BytesIO(content)
        ):
            response = self.client.get(
                reverse("internal-job-document", args=[latest_job.pk]),
                HTTP_AUTHORIZATION="Bearer test-service-token",
            )
        try:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["X-Document-ID"], str(latest_job.document_id))
            self.assertEqual(response["X-Source-SHA256"], latest_job.document.sha256)
            self.assertEqual(b"".join(response.streaming_content), content)
        finally:
            response.close()

    @override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
    def test_file_open_error_is_reported_without_storage_details(self):
        with patch(
            "django.db.models.fields.files.FieldFile.open",
            side_effect=OSError("/private/storage/path unavailable"),
        ):
            with self.assertLogs("apps.documents.internal_views", level="ERROR") as logs:
                response = self.client.get(
                    reverse("internal-job-document", args=[self.job.pk]),
                    HTTP_AUTHORIZATION="Bearer test-service-token",
                )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": "source_unavailable"})
        self.assertNotIn("/private/storage/path", response.content.decode())
        self.assertNotIn("/private/storage/path", " ".join(logs.output))
        self.assertNotIn("Traceback", " ".join(logs.output))
