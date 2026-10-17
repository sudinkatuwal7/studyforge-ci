"""Celery tasks for standalone document processing."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from celery import shared_task

from .chunking import chunk_pages
from .embedding_service import embed_texts
from .errors import PermanentProcessingError, RetryableProcessingError
from .pdf_parser import extract_pdf_text
from .result_client import submit_callback
from .source_client import fetch_source_pdf

TASK_MAX_RETRIES = 3
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
    """Fetch, extract, chunk, and embed one document without application models."""
    attempt = self.request.retries + 1
    identity = {
        "schema_version": 1,
        "job_id": job_id,
        "document_id": document_id,
        "source_sha256": source_sha256,
        "attempt": attempt,
    }
    _submit_or_retry(self, {**identity, "status": "RUNNING"})

    try:
        pdf_bytes = fetch_source_pdf(job_id, document_id, source_sha256)
        extraction = extract_pdf_text(BytesIO(pdf_bytes))
        chunks = chunk_pages(extraction.pages)
        embeddings = embed_texts([chunk.content for chunk in chunks])
    except RetryableProcessingError as exc:
        if self.request.retries < TASK_MAX_RETRIES:
            raise self.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
        _submit_or_retry(
            self,
            {**identity, "status": "FAILED", "error_code": "PROCESSING_FAILED"},
        )
        raise
    except Exception:
        _submit_or_retry(
            self,
            {**identity, "status": "FAILED", "error_code": "PROCESSING_FAILED"},
        )
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
        _submit_or_retry(self, result)
    except PermanentProcessingError:
        _submit_or_retry(
            self,
            {**identity, "status": "FAILED", "error_code": "PROCESSING_FAILED"},
        )
        raise
    return result


def _submit_or_retry(task, payload: dict[str, Any]) -> None:
    try:
        outcome = submit_callback(payload["job_id"], payload)
    except RetryableProcessingError as exc:
        if task.request.retries >= TASK_MAX_RETRIES:
            raise
        raise task.retry(exc=exc, countdown=TASK_RETRY_COUNTDOWN_SECONDS)
    if payload["status"] == "RUNNING" and outcome in {"terminal", "stale"}:
        raise PermanentProcessingError(
            "Django rejected this processing task as stale or already terminal."
        )
