"""Lifecycle tests for processing orchestration."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from apps.processing.constants import (
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_PROCESSING,
    STATUS_READY,
    TASK_MAX_RETRIES,
)
from apps.processing.exceptions import (
    DocumentNotFoundError,
    InvalidPDFError,
    PermanentProcessingError,
    RetryableProcessingError,
)
from apps.processing.pdf_parser import ExtractionResult
from apps.processing.services import (
    extract_pdf_from_document,
    is_ready,
    mark_document_failed,
    process_document,
    set_document_status,
    store_extracted_text,
)
from apps.processing.tests.fakes import FakeDocument, FakeFile


class ProcessDocumentSuccessTests(unittest.TestCase):
    def test_successful_processing_sets_processing_then_ready(self):
        document = FakeDocument(status=STATUS_PENDING)
        extraction = ExtractionResult(text="hello pages", page_count=2)
        extract_fn = MagicMock(return_value=extraction)
        store_fn = MagicMock()

        result = process_document(
            document.pk,
            load_document_fn=lambda _document_id: document,
            extract_fn=extract_fn,
            store_fn=store_fn,
        )

        self.assertEqual(result["status"], STATUS_READY)
        self.assertFalse(result["skipped"])
        self.assertEqual(document.status, STATUS_READY)
        self.assertEqual(document.save_calls, [STATUS_PROCESSING, STATUS_READY])
        extract_fn.assert_called_once_with(document)
        store_fn.assert_called_once_with(document, extraction)

    def test_sets_processing_before_extraction_runs(self):
        document = FakeDocument(status=STATUS_PENDING)
        seen_status = {}

        def extract_fn(_document):
            seen_status["during_extract"] = document.status
            return ExtractionResult(text="body", page_count=1)

        process_document(
            document.pk,
            load_document_fn=lambda _document_id: document,
            extract_fn=extract_fn,
            store_fn=MagicMock(),
        )

        self.assertEqual(seen_status["during_extract"], STATUS_PROCESSING)


class ProcessDocumentFailureTests(unittest.TestCase):
    def test_permanent_failure_sets_failed(self):
        document = FakeDocument(status=STATUS_PENDING)

        def extract_fn(_document):
            raise InvalidPDFError("not a pdf")

        with self.assertRaises(InvalidPDFError):
            process_document(
                document.pk,
                load_document_fn=lambda _document_id: document,
                extract_fn=extract_fn,
                store_fn=MagicMock(),
            )

        self.assertEqual(document.status, STATUS_FAILED)
        self.assertEqual(document.save_calls[0], STATUS_PROCESSING)
        self.assertEqual(document.save_calls[-1], STATUS_FAILED)

    def test_retryable_failure_leaves_processing_for_retry(self):
        document = FakeDocument(status=STATUS_PENDING)

        def extract_fn(_document):
            raise RetryableProcessingError("temporary io error")

        with self.assertRaises(RetryableProcessingError):
            process_document(
                document.pk,
                load_document_fn=lambda _document_id: document,
                extract_fn=extract_fn,
                store_fn=MagicMock(),
            )

        self.assertEqual(document.status, STATUS_PROCESSING)
        self.assertNotIn(STATUS_FAILED, document.save_calls)
        self.assertNotIn(STATUS_READY, document.save_calls)

    def test_unexpected_exception_is_retryable(self):
        document = FakeDocument(status=STATUS_PENDING)

        def extract_fn(_document):
            raise RuntimeError("worker disk full")

        with self.assertRaises(RetryableProcessingError):
            process_document(
                document.pk,
                load_document_fn=lambda _document_id: document,
                extract_fn=extract_fn,
                store_fn=MagicMock(),
            )

        self.assertEqual(document.status, STATUS_PROCESSING)


class MissingDocumentTests(unittest.TestCase):
    def test_missing_document_raises_not_found(self):
        def load_missing(_document_id):
            raise DocumentNotFoundError("Document 999 was not found.")

        with self.assertRaises(DocumentNotFoundError):
            process_document(
                999,
                load_document_fn=load_missing,
                extract_fn=MagicMock(),
                store_fn=MagicMock(),
            )

    def test_mark_failed_is_noop_when_document_is_missing(self):
        def load_missing(_document_id):
            raise DocumentNotFoundError("missing")

        from apps.processing import services

        original = services.load_document
        services.load_document = load_missing
        try:
            mark_document_failed(999, error="gone")
        finally:
            services.load_document = original


class IdempotencyTests(unittest.TestCase):
    def test_already_ready_document_is_not_processed_again(self):
        document = FakeDocument(status=STATUS_READY)
        extract_fn = MagicMock()
        store_fn = MagicMock()

        result = process_document(
            document.pk,
            load_document_fn=lambda _document_id: document,
            extract_fn=extract_fn,
            store_fn=store_fn,
        )

        self.assertTrue(result["skipped"])
        self.assertEqual(document.status, STATUS_READY)
        extract_fn.assert_not_called()
        store_fn.assert_not_called()
        self.assertEqual(document.save_calls, [])


class StorageAndParserWiringTests(unittest.TestCase):
    def test_orchestration_calls_parser_and_storage_once(self):
        document = FakeDocument(status=STATUS_PENDING, with_optional_fields=True)
        extraction = ExtractionResult(text="stored text", page_count=3)
        extract_fn = MagicMock(return_value=extraction)
        store_fn = MagicMock(side_effect=store_extracted_text)

        process_document(
            document.pk,
            load_document_fn=lambda _document_id: document,
            extract_fn=extract_fn,
            store_fn=store_fn,
        )

        extract_fn.assert_called_once_with(document)
        store_fn.assert_called_once()
        self.assertEqual(document.extracted_text, "stored text")
        self.assertEqual(document.page_count, 3)

    def test_store_extracted_text_ignores_unknown_fields(self):
        document = FakeDocument(status=STATUS_PROCESSING)
        store_extracted_text(document, ExtractionResult(text="x", page_count=1))
        self.assertFalse(hasattr(document, "extracted_text"))

    def test_extract_pdf_from_document_uses_file_open(self):
        document = FakeDocument(file=FakeFile(b"%PDF-1.4"))
        fake_result = ExtractionResult(text="page", page_count=1)

        from apps.processing import services

        original = services.extract_pdf_text
        services.extract_pdf_text = MagicMock(return_value=fake_result)
        try:
            result = extract_pdf_from_document(document)
        finally:
            services.extract_pdf_text = original

        self.assertEqual(result, fake_result)

    def test_missing_file_is_permanent(self):
        document = FakeDocument()
        document.file = None
        with self.assertRaises(PermanentProcessingError):
            extract_pdf_from_document(document)


class StatusHelperTests(unittest.TestCase):
    def test_is_ready_uses_document_status_enum(self):
        document = FakeDocument(status=FakeDocument.Status.READY)
        self.assertTrue(is_ready(document))

    def test_set_failed_records_optional_error_fields(self):
        document = FakeDocument(with_optional_fields=True)
        set_document_status(document, STATUS_FAILED, error="bad pdf")
        self.assertEqual(document.status, STATUS_FAILED)
        self.assertEqual(document.error_code, "PROCESSING_FAILED")
        self.assertEqual(document.error_message, "bad pdf")


class RetryBoundTests(unittest.TestCase):
    def test_retry_limit_is_finite(self):
        self.assertIsInstance(TASK_MAX_RETRIES, int)
        self.assertGreater(TASK_MAX_RETRIES, 0)
        self.assertLessEqual(TASK_MAX_RETRIES, 10)
