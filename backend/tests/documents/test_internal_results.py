"""Authenticated processing callback validation and persistence."""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.courses.models import Course
from apps.documents.models import Document, Job
from apps.documents.result_callbacks import MAX_CALLBACK_BYTES
from apps.knowledge.models import Chunk


@override_settings(PROCESSING_SERVICE_TOKEN="test-service-token")
class InternalJobResultViewTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create(email="internal-result@example.test")
        course = Course.objects.create(owner=self.owner, name="Internal result")
        self.document = Document.objects.create(
            owner=self.owner,
            course=course,
            title="lecture.pdf",
            sha256="a" * 64,
            file="documents/lecture.pdf",
        )
        self.job = Job.objects.create(document=self.document)
        self.url = reverse("internal-job-result", args=[self.job.pk])
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.owner)

    def callback(self, status, **fields):
        payload = {
            "schema_version": 1,
            "job_id": self.job.pk,
            "document_id": self.document.pk,
            "source_sha256": self.document.sha256,
            "status": status,
            "attempt": 1,
            **fields,
        }
        return self.client.post(
            self.url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )

    def csrf_checked_callback(self, *, token):
        payload = {
            "schema_version": 1,
            "job_id": self.job.pk,
            "document_id": self.document.pk,
            "source_sha256": self.document.sha256,
            "status": "RUNNING",
            "attempt": 1,
        }
        client = APIClient(enforce_csrf_checks=True)
        headers = {}
        if token is not None:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return client.post(
            self.url,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def success_payload(self):
        return {
            "page_count": 2,
            "likely_scanned": False,
            "chunks": [
                {
                    "page_number": 2,
                    "content": "Recognized lecture text.",
                    "embedding": [0.25] * 768,
                }
            ],
        }

    def test_success_atomically_persists_chunks_and_completes_job_and_document(self):
        response = self.callback("SUCCEEDED", **self.success_payload())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "applied"})
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        chunk = Chunk.objects.get(document=self.document)
        self.assertEqual(self.job.status, Job.Status.SUCCEEDED)
        self.assertEqual(self.job.attempts, 1)
        self.assertEqual(self.document.status, Document.Status.READY)
        self.assertIsNone(self.document.error_code)
        self.assertEqual(self.document.page_count, 2)
        self.assertEqual(chunk.owner_id, self.document.owner_id)
        self.assertEqual(chunk.page_number, 2)
        self.assertEqual(chunk.content, "Recognized lecture text.")
        self.assertEqual(list(chunk.embedding), [0.25] * 768)
        detail = self.api_client.get(reverse("document-detail", args=[self.document.pk]))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["status"], "READY")

    def test_repeated_success_is_idempotent(self):
        payload = self.success_payload()
        self.assertEqual(self.callback("SUCCEEDED", **payload).status_code, 200)

        response = self.callback("SUCCEEDED", **payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "duplicate"})
        self.assertEqual(Chunk.objects.filter(document=self.document).count(), 1)

    def test_running_and_failed_callbacks_update_public_status_safely(self):
        running = self.callback("RUNNING")
        self.assertEqual(running.status_code, 200)
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.RUNNING)
        self.assertEqual(self.document.status, Document.Status.PROCESSING)

        failed = self.callback("FAILED", error_code="PROCESSING_FAILED", attempt=2)

        self.assertEqual(failed.status_code, 200)
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.FAILED)
        self.assertEqual(self.job.attempts, 2)
        self.assertEqual(self.document.status, Document.Status.FAILED)
        self.assertEqual(self.document.error_code, Document.ErrorCode.PROCESSING_FAILED)
        self.assertEqual(Chunk.objects.count(), 0)

    def test_older_attempt_result_cannot_overwrite_newer_running_attempt(self):
        self.assertEqual(self.callback("RUNNING", attempt=2).status_code, 200)

        response = self.callback("SUCCEEDED", **{
            **self.success_payload(),
            "attempt": 1,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "stale"})
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.RUNNING)
        self.assertEqual(self.job.attempts, 2)
        self.assertEqual(self.document.status, Document.Status.PROCESSING)
        self.assertFalse(Chunk.objects.exists())

    def test_unauthorized_callback_does_not_change_state(self):
        payload = {
            "schema_version": 1,
            "job_id": self.job.pk,
            "document_id": self.document.pk,
            "source_sha256": self.document.sha256,
            "status": "RUNNING",
            "attempt": 1,
        }
        response = self.client.post(
            self.url,
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)

    def test_worker_bearer_post_succeeds_with_csrf_checks_enabled(self):
        response = self.csrf_checked_callback(token="test-service-token")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "applied"})
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.RUNNING)

    def test_csrf_checked_callback_still_requires_valid_bearer_token(self):
        for token in (None, "incorrect-token"):
            with self.subTest(token=token):
                response = self.csrf_checked_callback(token=token)
                self.assertEqual(response.status_code, 401)

    def test_wrong_source_identity_is_rejected(self):
        response = self.callback("SUCCEEDED", **{
            **self.success_payload(),
            "source_sha256": "b" * 64,
        })

        self.assertEqual(response.status_code, 409)
        self.assertFalse(Chunk.objects.exists())
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)

    def test_wrong_document_identity_is_rejected(self):
        response = self.callback(
            "SUCCEEDED",
            **{**self.success_payload(), "document_id": self.document.pk + 1},
        )

        self.assertEqual(response.status_code, 409)
        self.assertFalse(Chunk.objects.exists())

    def test_oversized_callback_is_rejected_before_json_parsing(self):
        response = self.client.post(
            self.url,
            data=b" " * (MAX_CALLBACK_BYTES + 1),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )

        self.assertEqual(response.status_code, 413)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)

    def test_non_json_callback_is_rejected(self):
        response = self.client.post(
            self.url,
            data="status=RUNNING",
            content_type="application/x-www-form-urlencoded",
            HTTP_AUTHORIZATION="Bearer test-service-token",
        )

        self.assertEqual(response.status_code, 415)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)

    def test_invalid_embedding_rejects_entire_result_without_partial_writes(self):
        payload = self.success_payload()
        payload["chunks"][0]["embedding"] = [float("nan")] + [0.0] * 767

        response = self.callback("SUCCEEDED", **payload)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Chunk.objects.exists())
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)
        self.assertEqual(self.document.status, Document.Status.PENDING)

    def test_database_error_rolls_back_result_and_status_together(self):
        with patch(
            "apps.documents.result_callbacks.Chunk.objects.bulk_create",
            side_effect=DatabaseError("database unavailable"),
        ):
            response = self.callback("SUCCEEDED", **self.success_payload())

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": "result_unavailable"})
        self.assertFalse(Chunk.objects.exists())
        self.job.refresh_from_db()
        self.document.refresh_from_db()
        self.assertEqual(self.job.status, Job.Status.QUEUED)
        self.assertEqual(self.document.status, Document.Status.PENDING)

    def test_old_job_result_is_ignored_when_a_newer_run_exists(self):
        newer_job = Job.objects.create(document=self.document)

        response = self.callback("SUCCEEDED", **self.success_payload())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "stale"})
        self.assertFalse(Chunk.objects.exists())
        self.assertEqual(Job.objects.get(pk=newer_job.pk).status, Job.Status.QUEUED)
