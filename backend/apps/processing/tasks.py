"""Celery entry point for asynchronous PDF processing."""

from __future__ import annotations

import logging
from typing import Any

from celery import shared_task

from apps.processing.constants import TASK_MAX_RETRIES, TASK_RETRY_COUNTDOWN_SECONDS
from apps.processing.exceptions import PermanentProcessingError, RetryableProcessingError
from apps.processing.services import mark_document_failed, process_document

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=TASK_MAX_RETRIES, default_retry_delay=TASK_RETRY_COUNTDOWN_SECONDS)
def process_document_task(self, document_id: Any) -> dict[str, Any]:
    """Process one uploaded document outside the HTTP request.

    Temporary failures retry up to TASK_MAX_RETRIES times. Permanent failures
    and exhausted retries mark the document FAILED so it cannot stay PROCESSING.
    """
    try:
        return process_document(document_id)
    except PermanentProcessingError as exc:
        logger.exception("Permanent processing failure for document %s.", document_id)
        mark_document_failed(document_id, error=str(exc))
        raise
    except RetryableProcessingError as exc:
        return _retry_or_fail(self, document_id, exc)
    except Exception as exc:
        logger.exception("Unexpected processing failure for document %s.", document_id)
        return _retry_or_fail(self, document_id, exc)


def _retry_or_fail(task, document_id: Any, exc: BaseException) -> dict[str, Any]:
    retries = int(getattr(getattr(task, "request", None), "retries", 0) or 0)
    max_retries = int(getattr(task, "max_retries", TASK_MAX_RETRIES))
    if retries >= max_retries:
        logger.error(
            "Retries exhausted for document %s after %s retries.",
            document_id,
            retries,
        )
        mark_document_failed(document_id, error=str(exc))
        raise exc
    logger.warning(
        "Retrying document %s after failure (attempt %s/%s): %s",
        document_id,
        retries + 1,
        max_retries,
        exc,
    )
    raise task.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
