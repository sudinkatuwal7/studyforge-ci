"""Celery task retry and failure-boundary tests."""

from __future__ import annotations

import sys
import unittest
from unittest.mock import MagicMock, patch


def _install_celery_stub() -> None:
    """Allow tasks.py to import without a project-level Celery install."""

    def shared_task(*args, **kwargs):
        def decorator(func):
            func.max_retries = kwargs.get("max_retries", 3)
            func.default_retry_delay = kwargs.get("default_retry_delay")
            return func

        if args and callable(args[0]) and not kwargs:
            return decorator(args[0])
        return decorator

    celery_mod = MagicMock()
    celery_mod.shared_task = shared_task
    sys.modules["celery"] = celery_mod


_install_celery_stub()

from apps.processing.constants import TASK_MAX_RETRIES  # noqa: E402
from apps.processing.exceptions import (  # noqa: E402
    DocumentNotFoundError,
    InvalidPDFError,
    RetryableProcessingError,
)
from apps.processing.tasks import process_document_task  # noqa: E402


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


class TaskRetryTests(unittest.TestCase):
    def test_task_max_retries_is_bounded(self):
        self.assertEqual(process_document_task.max_retries, TASK_MAX_RETRIES)
        self.assertGreater(process_document_task.max_retries, 0)

    def test_retryable_failure_retries_before_limit(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RetryableProcessingError("temporary")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(FakeRetry):
                    process_document_task(task, 42)
                mark_failed.assert_not_called()
                task.retry.assert_called_once()

    def test_retryable_failure_cannot_retry_forever(self):
        task = _task_self(retries=TASK_MAX_RETRIES)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RetryableProcessingError("still failing")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(RetryableProcessingError):
                    process_document_task(task, 42)
                mark_failed.assert_called_once()
                task.retry.assert_not_called()

    def test_unexpected_exception_retries_then_fails(self):
        task = _task_self(retries=TASK_MAX_RETRIES)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = RuntimeError("boom")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(RuntimeError):
                    process_document_task(task, 42)
                mark_failed.assert_called_once_with(42, error="boom")


class TaskPermanentFailureTests(unittest.TestCase):
    def test_invalid_pdf_does_not_retry(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = InvalidPDFError("bad pdf")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(InvalidPDFError):
                    process_document_task(task, 42)
                mark_failed.assert_called_once_with(42, error="bad pdf")
                task.retry.assert_not_called()

    def test_missing_document_does_not_retry(self):
        task = _task_self(retries=0)
        with patch("apps.processing.tasks.process_document") as process:
            process.side_effect = DocumentNotFoundError("Document 7 was not found.")
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                with self.assertRaises(DocumentNotFoundError):
                    process_document_task(task, 7)
                mark_failed.assert_called_once_with(7, error="Document 7 was not found.")
                task.retry.assert_not_called()

    def test_success_does_not_mark_failed(self):
        task = _task_self()
        payload = {"document_id": 42, "status": "READY", "skipped": False}
        with patch("apps.processing.tasks.process_document", return_value=payload):
            with patch("apps.processing.tasks.mark_document_failed") as mark_failed:
                result = process_document_task(task, 42)
        self.assertEqual(result, payload)
        mark_failed.assert_not_called()
        task.retry.assert_not_called()
