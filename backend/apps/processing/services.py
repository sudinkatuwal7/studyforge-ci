"""Document processing orchestration.

This module owns the status lifecycle and the calls into PDF extraction
and extracted-content storage. It does not create a Document model; it
uses Person 3's documents app at runtime.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from apps.processing.constants import (
    STATUS_FAILED,
    STATUS_PROCESSING,
    STATUS_READY,
)
from apps.processing.exceptions import (
    DocumentNotFoundError,
    PermanentProcessingError,
    RetryableProcessingError,
)
from apps.processing.pdf_parser import ExtractionResult, extract_pdf_text

logger = logging.getLogger(__name__)


def get_document_model():
    """Load Person 3's Document model without importing it at module level."""
    try:
        from apps.documents.models import Document
    except ImportError as exc:
        raise PermanentProcessingError(
            "Document model is unavailable. The documents app has not been implemented yet."
        ) from exc
    return Document


def load_document(document_id: Any):
    """Return the Document for document_id or raise DocumentNotFoundError."""
    Document = get_document_model()
    try:
        return Document.objects.get(pk=document_id)
    except Document.DoesNotExist as exc:
        raise DocumentNotFoundError(f"Document {document_id} was not found.") from exc


def resolve_status(document: Any, status_name: str) -> str:
    """Use Document.Status members when they exist; otherwise the contract string."""
    status_enum = getattr(type(document), "Status", None)
    if status_enum is not None and hasattr(status_enum, status_name):
        return getattr(status_enum, status_name)
    return status_name


def is_ready(document: Any) -> bool:
    return document.status == resolve_status(document, STATUS_READY)


def set_document_status(document: Any, status_name: str, error: str | None = None) -> None:
    """Persist a processing status before or after work."""
    document.status = resolve_status(document, status_name)
    update_fields = ["status"]

    if error is not None:
        if hasattr(document, "error_code"):
            document.error_code = "PROCESSING_FAILED"
            update_fields.append("error_code")
        if hasattr(document, "error_message"):
            document.error_message = error
            update_fields.append("error_message")
    elif status_name == STATUS_READY:
        if hasattr(document, "error_code"):
            document.error_code = None
            update_fields.append("error_code")
        if hasattr(document, "error_message"):
            document.error_message = ""
            update_fields.append("error_message")

    document.save(update_fields=update_fields)
    logger.info("Document %s status set to %s.", getattr(document, "pk", "?"), document.status)


def get_document_file(document: Any):
    """Return the uploaded file from Person 3's Document.file field."""
    file_field = getattr(document, "file", None)
    if file_field in (None, ""):
        raise PermanentProcessingError(
            f"Document {getattr(document, 'pk', '?')} has no uploaded file."
        )
    return file_field


def extract_pdf_from_document(document: Any) -> ExtractionResult:
    """Read the document's uploaded PDF and extract text."""
    file_field = get_document_file(document)
    try:
        if hasattr(file_field, "open"):
            with file_field.open("rb") as handle:
                return extract_pdf_text(handle)
        return extract_pdf_text(file_field)
    except PermanentProcessingError:
        raise
    except OSError as exc:
        raise RetryableProcessingError(
            f"Could not read PDF for document {getattr(document, 'pk', '?')}."
        ) from exc


def store_extracted_text(document: Any, result: ExtractionResult) -> None:
    """Persist extracted PDF content through fields Person 3 already exposes.

    DocumentChunk / knowledge storage is out of scope for SCRUM-11. This hook
    writes optional document fields when they exist so the Celery task has a
    single storage call site.
    """
    update_fields: list[str] = []
    if hasattr(document, "extracted_text"):
        document.extracted_text = result.text
        update_fields.append("extracted_text")
    if hasattr(document, "page_count"):
        document.page_count = result.page_count
        update_fields.append("page_count")
    if update_fields:
        document.save(update_fields=update_fields)
    logger.info(
        "Stored extraction for document %s (%s pages, %s characters).",
        getattr(document, "pk", "?"),
        result.page_count,
        len(result.text),
    )


def mark_document_failed(document_id: Any, error: str | None = None) -> None:
    """Move a document to FAILED. No-op when the row no longer exists."""
    try:
        document = load_document(document_id)
    except (DocumentNotFoundError, PermanentProcessingError):
        logger.error("Cannot mark document %s as FAILED; record is unavailable.", document_id)
        return
    set_document_status(document, STATUS_FAILED, error=error)


def process_document(
    document_id: Any,
    *,
    load_document_fn: Callable[[Any], Any] = load_document,
    extract_fn: Callable[[Any], ExtractionResult] = extract_pdf_from_document,
    store_fn: Callable[[Any, ExtractionResult], None] = store_extracted_text,
) -> dict[str, Any]:
    """Run the PROCESSING → extract → store → READY lifecycle for one document."""
    document = load_document_fn(document_id)

    if is_ready(document):
        logger.info("Document %s is already READY; skipping duplicate processing.", document_id)
        return {"document_id": document_id, "status": STATUS_READY, "skipped": True}

    set_document_status(document, STATUS_PROCESSING)

    try:
        extraction = extract_fn(document)
        store_fn(document, extraction)
    except PermanentProcessingError:
        set_document_status(document, STATUS_FAILED)
        raise
    except RetryableProcessingError:
        raise
    except Exception as exc:
        raise RetryableProcessingError(str(exc)) from exc

    set_document_status(document, STATUS_READY)
    return {"document_id": document_id, "status": STATUS_READY, "skipped": False}
