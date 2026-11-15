"""Celery task for document processing and durable terminal callback delivery."""

from __future__ import annotations

from typing import Any

from celery import shared_task

from . import execution_store
from .chunking import chunk_pages
from .embedding_service import embed_texts
from .errors import DocumentDeletedError, PermanentProcessingError, RetryableProcessingError
from .document_parser import extract_document
from .embedding_service import embed_texts
from .errors import OversizedCallbackError, PermanentProcessingError, RetryableProcessingError
from .result_client import submit_callback
from .source_client import fetch_source_document

PROCESSING_MAX_RETRIES = 3
RUNNING_MAX_RETRIES = 3
DELIVERY_MAX_RETRIES = 3
# RUNNING delivery can consume retries before any source processing begins.
# Reserve the full terminal-delivery budget even after those earlier retries.
TASK_MAX_RETRIES = RUNNING_MAX_RETRIES + PROCESSING_MAX_RETRIES + DELIVERY_MAX_RETRIES
TASK_RETRY_COUNTDOWN_SECONDS = 60


@shared_task(
    bind=True,
    name="processing_service.tasks.process_document_task",
    max_retries=TASK_MAX_RETRIES,
    default_retry_delay=TASK_RETRY_COUNTDOWN_SECONDS,
    ignore_result=False,
)
def process_document_task(
    self,
    job_id: int,
    document_id: int,
    source_sha256: str,
) -> dict[str, Any]:
    """Stage one terminal result before delivery; retries replay staged data."""
    execution_store.get_or_create_execution(job_id, document_id, source_sha256)
    attempt, saved = execution_store.start_or_resume(job_id)
    if saved is not None:
        return _deliver_saved(self, job_id)

    identity = {
        "schema_version": 1,
        "job_id": job_id,
        "document_id": document_id,
        "source_sha256": source_sha256,
        "attempt": attempt,
    }
    _send_running_or_retry(self, {**identity, "status": "RUNNING"})

    try:
        source = fetch_source_document(job_id, document_id, source_sha256)
        extraction = extract_document(source.content, source.mime_type)
        chunks = chunk_pages(extraction.pages)
        if not chunks:
            raise PermanentProcessingError("The document contained no extractable text.")
        embeddings = embed_texts([chunk.content for chunk in chunks])
    except DocumentDeletedError:
        # A user deletion is terminal. Do not retry or send a FAILED callback
        # for a document that no longer exists.
        return {**identity, "status": "DELETED"}
    except RetryableProcessingError as exc:
        if attempt <= PROCESSING_MAX_RETRIES and self.request.retries < TASK_MAX_RETRIES:
            execution_store.prepare_processing_retry(job_id)
            raise self.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
        _stage_failure(job_id, identity)
        _deliver_saved(self, job_id)
        raise
    except Exception:
        _stage_failure(job_id, identity)
        _deliver_saved(self, job_id)
        raise

    result = {
        **identity,
        "status": "SUCCEEDED",
        "page_count": extraction.page_count,
        "likely_scanned": extraction.likely_scanned,
        "chunks": [
            {
                "page_number": chunk.page_number,
                "content": chunk.content,
                "embedding": embedding,
            }
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ],
    }

    try:
        execution_store.stage_terminal(job_id, result)
    except OversizedCallbackError:
        # An oversized local result never reaches Django or the staging DB.
        _stage_failure(job_id, identity)
        _deliver_saved(self, job_id)
        raise
    return _deliver_saved(self, job_id)


def _stage_failure(job_id: int, identity: dict[str, Any]) -> None:
    execution_store.stage_terminal(
        job_id, {**identity, "status": "FAILED", "error_code": "PROCESSING_FAILED"},
    )


def _send_running_or_retry(task, payload: dict[str, Any]) -> None:
    try:
        outcome = submit_callback(payload["job_id"], payload)
    except RetryableProcessingError as exc:
        if task.request.retries >= RUNNING_MAX_RETRIES:
            raise
        raise task.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
    if outcome in {"terminal", "stale"}:
        raise PermanentProcessingError("Django rejected this processing task as stale or already terminal.")


def _deliver_saved(task, job_id: int) -> dict[str, Any]:
    payload, status, attempts, should_send = execution_store.begin_delivery(
        job_id, DELIVERY_MAX_RETRIES + 1,
    )
    if status == "DELIVERED":
        return payload
    if status == "REJECTED":
        raise PermanentProcessingError("Django permanently rejected the saved processing callback.")
    if not should_send:
        raise RetryableProcessingError("Saved processing callback delivery attempts are exhausted.")

    try:
        outcome = submit_callback(job_id, payload)
    except RetryableProcessingError as exc:
        if attempts <= DELIVERY_MAX_RETRIES and task.request.retries < TASK_MAX_RETRIES:
            raise task.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
        raise
    except PermanentProcessingError:
        execution_store.mark_rejected(job_id)
        raise

    if outcome in {"applied", "duplicate"}:
        execution_store.mark_delivered(job_id)
        return payload
    execution_store.mark_rejected(job_id)
    raise PermanentProcessingError("Django rejected the saved processing callback as stale or terminal.")
