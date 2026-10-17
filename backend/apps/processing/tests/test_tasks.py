"""Celery task retry and failure-boundary tests."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from celery.app.task import Task

from apps.processing.constants import TASK_MAX_RETRIES
from apps.processing.exceptions import (
    DocumentNotFoundError,
    InvalidPDFError,
    RetryableProcessingError,
)
from apps.processing.tasks import process_document_task


class FakeRetry(Exception):
    def __init__(self, exc=None):
        super().__init__(str(exc))
        self.exc = exc


def _task_self(*, retries: int = 0, max_retries: int = TASK_MAX_RETRIES) -> MagicMock:
    task = MagicMock()
    task.request.retries = retries
    task.max_retries = max_retries
    task.retry.side_effect = lambda exc=None, countdown=None: (_ for _ in ()).throw(FakeRetry(exc))
    return task


def _run_task(task, document_id):
    """Exercise the real bound task synchronously, with isolated retry state."""
    process_document_task.push_request(retries=task.request.retries)
    try:
        with patch.object(process_document_task, "retry", task.retry), patch.object(
            process_document_task, "max_retries", task.max_retries
        ):
            return process_document_task.run(document_id)
    finally:
        process_document_task.pop_request()


class TaskRetryTests(unittest.TestCase):
    def test_real_celery_task_is_registered_under_its_legacy_name(self):
        from apps.documents.dispatch import PROCESS_DOCUMENT_TASK
        from config.celery import app

        self.assertIsInstance(process_document_task._get_current_object(), Task)
        self.assertEqual(
            process_document_task.name,
            "apps.processing.tasks.process_document_task",
        )
        self.assertIn(process_document_task.name, app.tasks)
        self.assertNotEqual(process_document_task.name, PROCESS_DOCUMENT_TASK)

    def test_task_max_retries_is_bounded(self):
        self.assertEqual(process_document_task.max_retries, TASK_MAX_RETRIES)
        self.assertGreater(process_document_task.max_retries, 0)

    def test_retryable_failure_retries_before_limit(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RetryableProcessingError("temporary")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(FakeRetry):
                    _run_task(task, 42)
                mark_failed.assert_not_called()
                task.retry.assert_called_once()

    def test_retryable_failure_cannot_retry_forever(self):
        task = _task_self(retries=TASK_MAX_RETRIES)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RetryableProcessingError("still failing")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(RetryableProcessingError):
                    _run_task(task, 42)
                mark_failed.assert_called_once()
                task.retry.assert_not_called()

    def test_unexpected_exception_retries_then_fails(self):
        task = _task_self(retries=TASK_MAX_RETRIES)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RuntimeError("boom")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(RuntimeError):
                    _run_task(task, 42)
                mark_failed.assert_called_once_with(42, error="boom")


class TaskPermanentFailureTests(unittest.TestCase):
    def test_invalid_pdf_does_not_retry(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = InvalidPDFError("bad pdf")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(InvalidPDFError):
                    _run_task(task, 42)
                mark_failed.assert_called_once_with(42, error="bad pdf")
                task.retry.assert_not_called()

    def test_missing_document_does_not_retry(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = DocumentNotFoundError("Document 7 was not found.")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(DocumentNotFoundError):
                    _run_task(task, 7)
                mark_failed.assert_called_once_with(7, error="Document 7 was not found.")
                task.retry.assert_not_called()

    def test_success_does_not_mark_failed(self):
        task = _task_self()
        payload = {"document_id": 42, "status": "READY", "skipped": False}
        with patch("apps.processing.tasks.process_document", return_value=payload):
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                result = _run_task(task, 42)
        self.assertEqual(result, payload)
        mark_failed.assert_not_called()
        task.retry.assert_not_called()
