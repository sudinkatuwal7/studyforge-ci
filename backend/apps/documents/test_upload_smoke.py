"""SCRUM-10 integration checks; the exhaustive upload matrix is SCRUM-12."""

import hashlib
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, connection
from django.test import TransactionTestCase, override_settings
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from pypdf import PdfWriter
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.courses.models import Course
from apps.documents.dispatch import DispatchFailed, DispatchUnconfirmed
from apps.documents.models import Document, Job


class DocumentUploadSmokeTests(TransactionTestCase):
    def setUp(self):
        media = TemporaryDirectory()
        self.addCleanup(media.cleanup)
        self.media = Path(media.name)
        settings = override_settings(MEDIA_ROOT=media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.owner = get_user_model().objects.create(email="upload@example.test")
        self.other = get_user_model().objects.create(email="other@example.test")
        self.course = Course.objects.create(owner=self.owner, name="Upload checks")
        self.url = f"/api/v1/courses/{self.course.pk}/documents/"
        self.client = APIClient()
        self.authenticate(self.owner)

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def pdf(self, *, encrypted=False, pages=1):
        output = BytesIO()
        writer = PdfWriter()
        for _ in range(pages):
            writer.add_blank_page(width=100, height=100)
        if encrypted:
            writer.encrypt("password")
        writer.write(output)
        return output.getvalue()

    def upload(self, content=None):
        return self.client.post(
            self.url,
            {"file": SimpleUploadedFile("lecture.PDF", self.pdf() if content is None else content)},
            format="multipart",
        )

    def test_creation_snapshot_is_committed_before_handoff_and_get_reads_current_state(self):
        content = self.pdf()

        def fast_worker(job_id, document_id, source_sha256):
            self.assertFalse(connection.in_atomic_block)
            document = Document.objects.get(pk=document_id)
            self.assertEqual(document.status, Document.Status.PENDING)
            self.assertEqual(document.owner_id, self.course.owner_id)
            job = document.jobs.get()
            self.assertEqual(job.status, Job.Status.QUEUED)
            self.assertEqual((job_id, document_id, source_sha256), (
                job.pk, document.pk, document.sha256
            ))
            document.status = Document.Status.PROCESSING
            document.save(update_fields=["status"])

        with patch("apps.documents.services.dispatch_document", side_effect=fast_worker) as dispatch:
            response = self.upload(content)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data), {"id", "course_id", "name", "status", "created_at", "updated_at", "error"})
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(response.data["created_at"], response.data["updated_at"])
        self.assertIsNone(response.data["error"])
        document = Document.objects.get(pk=response.data["id"])
        job = document.jobs.get()
        dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)
        self.assertEqual(document.sha256, hashlib.sha256(content).hexdigest())
        self.assertEqual(document.title, "lecture.PDF")
        with document.file.open("rb") as stored:
            self.assertEqual(stored.read(), content)
        detail = self.client.get(f"/api/v1/documents/{document.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["status"], "PROCESSING")
        self.assertEqual(detail["Cache-Control"], "no-store")

    def test_authentication_and_ownership_precede_pdf_validation(self):
        self.client.credentials()
        response = self.upload(b"invalid")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "AUTHENTICATION_REQUIRED")
        self.assertEqual(response["WWW-Authenticate"], "Bearer")
        self.authenticate(self.other)
        response = self.upload(b"invalid")
        missing = self.client.post("/api/v1/courses/0/documents/", {}, format="multipart")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data, missing.data)
        self.assertFalse(Document.objects.exists())
        self.assertFalse(list(self.media.rglob("*.pdf")))

    def test_invalid_pdf_rejections_leave_no_records_or_files(self):
        for content, code in (
            (b"", "EMPTY_FILE"),
            (b"not a pdf", "INVALID_PDF"),
            (self.pdf(pages=0), "INVALID_PDF"),
            (self.pdf(encrypted=True), "UNSUPPORTED_PDF"),
        ):
            with self.subTest(code=code):
                response = self.upload(content)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data["code"], code)
        self.assertFalse(Document.objects.exists())
        self.assertFalse(Job.objects.exists())
        self.assertFalse(list(self.media.rglob("*.pdf")))

    def test_database_failure_cleans_up_the_file_and_rolls_back_document(self):
        with patch("apps.documents.services.Job.objects.create", side_effect=DatabaseError), patch(
            "apps.documents.services.dispatch_document"
        ) as dispatch, self.assertLogs("apps.documents.services", level="ERROR"):
            response = self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "UPLOAD_UNAVAILABLE")
        dispatch.assert_not_called()
        self.assertFalse(Document.objects.exists())
        self.assertFalse(list(self.media.rglob("*.pdf")))

    def test_multipart_rejects_extra_fields_and_truncated_framing(self):
        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("lecture.pdf", self.pdf()), "owner": self.other.pk},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "INVALID_UPLOAD")
        body = encode_multipart(BOUNDARY, {"file": SimpleUploadedFile("lecture.pdf", self.pdf())})
        truncated = body.rsplit(f"--{BOUNDARY}--".encode(), 1)[0]
        response = self.client.generic("POST", self.url, truncated, content_type=MULTIPART_CONTENT)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "INVALID_REQUEST")
        self.assertFalse(Document.objects.exists())

    def test_dispatch_outcomes_preserve_stored_resource(self):
        for failure, code, status in (
            (DispatchFailed, "PROCESSING_DISPATCH_FAILED", "FAILED"),
            (DispatchUnconfirmed, "PROCESSING_HANDOFF_UNCONFIRMED", "PENDING"),
        ):
            with self.subTest(code=code), patch(
                "apps.documents.services.dispatch_document", side_effect=failure
            ):
                response = self.upload()
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.data["error"]["code"], code)
                self.assertIsInstance(response.data["document_id"], int)
                document = Document.objects.get(pk=response.data["document_id"])
                self.assertEqual(document.status, status)
                self.assertTrue(document.file.storage.exists(document.file.name))
                self.assertEqual(document.jobs.get().status, "FAILED" if status == "FAILED" else "QUEUED")
                detail = self.client.get(f"/api/v1/documents/{document.pk}/")
                self.assertEqual(detail.status_code, 200)
                self.assertEqual(detail.data["status"], status)
                if status == "FAILED":
                    self.assertEqual(detail.data["error"], response.data["error"])
                else:
                    self.assertIsNone(document.error_code)
                    self.assertIsNone(detail.data["error"])
