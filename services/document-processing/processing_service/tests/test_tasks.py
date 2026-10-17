from __future__ import annotations

from unittest.mock import patch

from celery.exceptions import Retry
from django.test import SimpleTestCase

from processing_service.celery import app
from processing_service.chunking import TextChunk
from processing_service.errors import PermanentProcessingError, RetryableProcessingError
from processing_service.pdf_parser import ExtractionResult, PageText
from processing_service.tasks import process_document_task


class DocumentTaskTests(SimpleTestCase):
    def test_task_is_registered_with_standalone_celery_app(self):
        task_name = "processing_service.tasks.process_document_task"
        self.assertIn(task_name, app.tasks)
        self.assertEqual(app.tasks[task_name].name, task_name)

    def test_task_fetches_processes_and_returns_correlated_results(self):
        digest = "a" * 64
        extraction = ExtractionResult(
            text="page text",
            page_count=1,
            pages=[PageText(page_number=1, text="page text")],
        )
        chunks = [TextChunk(page_number=1, content="page text")]
        embeddings = [[0.5] * 768]
        with (
            patch("processing_service.tasks.fetch_source_pdf", return_value=b"%PDF") as fetch,
            patch("processing_service.tasks.extract_pdf_text", return_value=extraction) as extract,
            patch("processing_service.tasks.chunk_pages", return_value=chunks) as chunk,
            patch("processing_service.tasks.embed_texts", return_value=embeddings) as embed,
            patch("processing_service.tasks.submit_callback") as callback,
        ):
            result = process_document_task.run(17, 42, digest)

        fetch.assert_called_once_with(17, 42, digest)
        extract.assert_called_once()
        chunk.assert_called_once_with(extraction.pages)
        embed.assert_called_once_with(["page text"])
        self.assertEqual(callback.call_count, 2)
        self.assertEqual(callback.call_args_list[0].args[1]["status"], "RUNNING")
        self.assertEqual(callback.call_args_list[1].args[1]["status"], "SUCCEEDED")
        self.assertEqual(result["job_id"], 17)
        self.assertEqual(result["document_id"], 42)
        self.assertEqual(result["source_sha256"], digest)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(result["page_count"], 1)
        self.assertEqual(
            result["chunks"],
            [{"page_number": 1, "content": "page text", "embedding": embeddings[0]}],
        )

    def test_retryable_failure_requests_celery_retry(self):
        with patch(
            "processing_service.tasks.fetch_source_pdf",
            side_effect=RetryableProcessingError("Django is temporarily unavailable"),
        ), patch.object(process_document_task, "retry", side_effect=Retry()) as retry, patch(
            "processing_service.tasks.submit_callback"
        ) as callback:
            with self.assertRaises(Retry):
                process_document_task.run(17, 42, "a" * 64)

        retry.assert_called_once()
        self.assertEqual(retry.call_args.kwargs["countdown"], 60)
        self.assertEqual(callback.call_count, 1)
        self.assertEqual(callback.call_args.args[1]["status"], "RUNNING")

    def test_permanent_failure_is_reported_to_django(self):
        with patch(
            "processing_service.tasks.fetch_source_pdf",
            side_effect=ValueError("invalid source"),
        ), patch("processing_service.tasks.submit_callback") as callback:
            with self.assertRaisesRegex(ValueError, "invalid source"):
                process_document_task.run(17, 42, "a" * 64)

        self.assertEqual(callback.call_count, 2)
        self.assertEqual(callback.call_args.args[1]["status"], "FAILED")
        self.assertEqual(callback.call_args.args[1]["error_code"], "PROCESSING_FAILED")

    def test_permanently_rejected_success_result_reports_failed_status(self):
        extraction = ExtractionResult(
            text="page text",
            page_count=1,
            pages=[PageText(page_number=1, text="page text")],
        )
        with (
            patch("processing_service.tasks.fetch_source_pdf", return_value=b"%PDF"),
            patch("processing_service.tasks.extract_pdf_text", return_value=extraction),
            patch("processing_service.tasks.chunk_pages", return_value=[]),
            patch("processing_service.tasks.embed_texts", return_value=[]),
            patch(
                "processing_service.tasks.submit_callback",
                side_effect=[None, PermanentProcessingError("Result exceeds callback limit"), None],
            ) as callback,
        ):
            with self.assertRaises(PermanentProcessingError):
                process_document_task.run(17, 42, "a" * 64)

        self.assertEqual(callback.call_count, 3)
        self.assertEqual(callback.call_args_list[1].args[1]["status"], "SUCCEEDED")
        self.assertEqual(callback.call_args_list[2].args[1]["status"], "FAILED")

    def test_stale_or_terminal_job_is_not_processed(self):
        with (
            patch("processing_service.tasks.submit_callback", return_value="stale"),
            patch("processing_service.tasks.fetch_source_pdf") as fetch,
        ):
            with self.assertRaises(PermanentProcessingError):
                process_document_task.run(17, 42, "a" * 64)
        fetch.assert_not_called()
