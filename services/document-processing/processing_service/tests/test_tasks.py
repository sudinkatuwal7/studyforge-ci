from __future__ import annotations

from unittest.mock import Mock, patch

from celery.exceptions import Retry
from django.test import SimpleTestCase

from processing_service.celery import app
from processing_service.chunking import TextChunk
from processing_service.errors import DocumentDeletedError, PermanentProcessingError, RetryableProcessingError
from processing_service.pdf_parser import ExtractionResult, PageText
from processing_service.source_client import SourceDocument
from processing_service.tasks import process_document_task


DIGEST = "a" * 64


def new_task_store():
    """Mock only the persistence boundary in pure task unit tests."""
    store = Mock()
    staged = {}
    store.start_or_resume.return_value = (1, None)

    def stage(_job_id, payload):
        staged.setdefault("payload", payload)
        return staged["payload"]

    store.stage_terminal.side_effect = stage
    store.begin_delivery.side_effect = lambda *_args: (staged["payload"], "PENDING", 1, True)
    return store


def extraction():
    return ExtractionResult(
        text="page text", page_count=1,
        pages=[PageText(page_number=1, text="page text")],
    )


class DocumentTaskTests(SimpleTestCase):
    def test_task_keeps_the_three_retry_limit(self):
        self.assertEqual(process_document_task.max_retries, 3)
        self.assertTrue(app.conf.task_acks_late)
        self.assertTrue(app.conf.task_reject_on_worker_lost)
        self.assertEqual(app.conf.worker_prefetch_multiplier, 1)
        self.assertEqual(app.conf.broker_transport_options["visibility_timeout"], 3600)

    def test_task_is_registered_with_standalone_celery_app(self):
        task_name = "processing_service.tasks.process_document_task"
        self.assertIn(task_name, app.tasks)
        self.assertEqual(app.tasks[task_name].name, task_name)

    def test_success_stages_before_delivery_and_returns_correlated_result(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document", return_value=SourceDocument(b"%PDF", "application/pdf")) as fetch,
            patch("processing_service.tasks.extract_document", return_value=extraction()) as extract,
            patch("processing_service.tasks.chunk_pages", return_value=[TextChunk(1, "page text")]) as chunk,
            patch("processing_service.tasks.embed_texts", return_value=[[0.5] * 768]) as embed,
            patch("processing_service.tasks.submit_callback", side_effect=["applied", "applied"]) as callback,
        ):
            result = process_document_task.run(17, 42, DIGEST)

        store.get_or_create_execution.assert_called_once_with(17, 42, DIGEST)
        store.start_or_resume.assert_called_once_with(17)
        store.stage_terminal.assert_called_once()
        store.begin_delivery.assert_called_once()
        store.mark_delivered.assert_called_once_with(17)
        fetch.assert_called_once_with(17, 42, DIGEST)
        extract.assert_called_once()
        chunk.assert_called_once()
        embed.assert_called_once_with(["page text"])
        self.assertEqual([call.args[1]["status"] for call in callback.call_args_list], ["RUNNING", "SUCCEEDED"])
        self.assertEqual(result["attempt"], 1)
        self.assertEqual(result["chunks"][0]["embedding"], [0.5] * 768)

    def test_retryable_processing_failure_requests_new_attempt(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document", side_effect=RetryableProcessingError("offline")),
            patch.object(process_document_task, "retry", side_effect=Retry()) as retry,
            patch("processing_service.tasks.submit_callback", return_value="applied") as callback,
        ):
            with self.assertRaises(Retry):
                process_document_task.run(17, 42, DIGEST)
        store.prepare_processing_retry.assert_called_once_with(17)
        store.stage_terminal.assert_not_called()
        retry.assert_called_once()
        self.assertEqual(retry.call_args.kwargs["countdown"], 60)
        self.assertEqual(callback.call_args.args[1]["status"], "RUNNING")

    def test_processing_failure_stages_only_safe_failed_callback(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document", side_effect=ValueError("private source detail")),
            patch("processing_service.tasks.submit_callback", side_effect=["applied", "applied"]) as callback,
        ):
            with self.assertRaisesRegex(ValueError, "private source detail"):
                process_document_task.run(17, 42, DIGEST)
        failed = store.stage_terminal.call_args.args[1]
        self.assertEqual(failed["status"], "FAILED")
        self.assertEqual(failed["error_code"], "PROCESSING_FAILED")
        self.assertNotIn("private", str(failed))
        self.assertEqual(callback.call_args.args[1], failed)
        store.mark_delivered.assert_called_once_with(17)

    def test_permanently_rejected_success_remains_successful_processing(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document", return_value=SourceDocument(b"%PDF", "application/pdf")),
            patch("processing_service.tasks.extract_document", return_value=extraction()),
            patch("processing_service.tasks.chunk_pages", return_value=[TextChunk(1, "page text")]),
            patch("processing_service.tasks.embed_texts", return_value=[[0.5] * 768]),
            patch("processing_service.tasks.submit_callback", side_effect=["applied", PermanentProcessingError("rejected")]) as callback,
        ):
            with self.assertRaises(PermanentProcessingError):
                process_document_task.run(17, 42, DIGEST)
        self.assertEqual(callback.call_count, 2)
        self.assertEqual(store.stage_terminal.call_args.args[1]["status"], "SUCCEEDED")
        store.mark_rejected.assert_called_once_with(17)
        store.mark_delivered.assert_not_called()

    def test_stale_running_callback_stops_before_source_fetch(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.submit_callback", return_value="stale"),
            patch("processing_service.tasks.fetch_source_document") as fetch,
        ):
            with self.assertRaises(PermanentProcessingError):
                process_document_task.run(17, 42, DIGEST)
        fetch.assert_not_called()
        store.stage_terminal.assert_not_called()

    def test_saved_callback_retry_skips_all_processing_and_preserves_attempt(self):
        saved = {
            "schema_version": 1, "job_id": 17, "document_id": 42,
            "source_sha256": DIGEST, "attempt": 3, "status": "SUCCEEDED",
            "page_count": 1, "likely_scanned": False, "chunks": [],
        }
        store = Mock()
        store.start_or_resume.return_value = (None, saved)
        store.begin_delivery.return_value = (saved, "PENDING", 2, True)
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document") as fetch,
            patch("processing_service.tasks.extract_document") as extract,
            patch("processing_service.tasks.chunk_pages") as chunk,
            patch("processing_service.tasks.embed_texts") as embed,
            patch("processing_service.tasks.submit_callback", return_value="duplicate") as callback,
        ):
            result = process_document_task.run(17, 42, DIGEST)
        self.assertEqual(result, saved)
        self.assertEqual(callback.call_args.args[1]["attempt"], 3)
        store.mark_delivered.assert_called_once_with(17)
        store.stage_terminal.assert_not_called()
        fetch.assert_not_called()

    def test_deleted_document_does_not_retry_or_send_a_failed_callback(self):
        with (
            patch(
                "processing_service.tasks.fetch_source_document",
                side_effect=DocumentDeletedError("Django returned 404"),
            ),
            patch.object(process_document_task, "retry") as retry,
            patch("processing_service.tasks.submit_callback") as callback,
        ):
            result = process_document_task.run(17, 42, "a" * 64)

        retry.assert_not_called()
        self.assertEqual(callback.call_count, 1)
        self.assertEqual(callback.call_args.args[1]["status"], "RUNNING")
        self.assertEqual(result["status"], "DELETED")
        extract.assert_not_called()
        chunk.assert_not_called()
        embed.assert_not_called()
        self.assertEqual(callback.call_count, 1)

    def test_temporary_delivery_failure_leaves_saved_result_pending(self):
        store = new_task_store()
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.fetch_source_document", return_value=SourceDocument(b"%PDF", "application/pdf")),
            patch("processing_service.tasks.extract_document", return_value=extraction()),
            patch("processing_service.tasks.chunk_pages", return_value=[TextChunk(1, "page text")]),
            patch("processing_service.tasks.embed_texts", return_value=[[0.5] * 768]),
            patch("processing_service.tasks.submit_callback", side_effect=["applied", RetryableProcessingError("offline")]),
            patch.object(process_document_task, "retry", side_effect=Retry()) as retry,
        ):
            with self.assertRaises(Retry):
                process_document_task.run(17, 42, DIGEST)
        store.stage_terminal.assert_called_once()
        store.mark_delivered.assert_not_called()
        store.mark_rejected.assert_not_called()
        store.prepare_processing_retry.assert_not_called()
        retry.assert_called_once()

    def test_terminal_stale_outcome_is_permanent_rejection(self):
        saved = {"job_id": 17, "status": "SUCCEEDED", "attempt": 2}
        store = Mock()
        store.start_or_resume.return_value = (None, saved)
        store.begin_delivery.return_value = (saved, "PENDING", 1, True)
        with (
            patch("processing_service.tasks.execution_store", store),
            patch("processing_service.tasks.submit_callback", return_value="stale"),
        ):
            with self.assertRaises(PermanentProcessingError):
                process_document_task.run(17, 42, DIGEST)
        store.mark_rejected.assert_called_once_with(17)
