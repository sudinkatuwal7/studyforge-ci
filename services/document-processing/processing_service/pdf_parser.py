"""Extract per-page text from PDF inputs without application model dependencies."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .errors import InvalidPDFError, PermanentProcessingError

logger = logging.getLogger(__name__)
SCANNED_TEXT_THRESHOLD_PER_PAGE = 50


@dataclass(frozen=True)
class PageText:
    """Text extracted from one PDF page; page numbers are 1-based."""

    page_number: int
    text: str


@dataclass(frozen=True)
class ExtractionResult:
    """Extracted document text with page boundaries and scan heuristic."""

    text: str
    page_count: int
    pages: list[PageText] = field(default_factory=list)
    average_text_per_page: float = 0.0
    likely_scanned: bool = False


def _load_pdf_reader():
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise PermanentProcessingError(
            "pypdf is not installed; PDF extraction is unavailable."
        ) from exc
    return PdfReader


def extract_pdf_text(source: Any) -> ExtractionResult:
    """Extract text from a PDF path or file-like object, preserving page order."""
    reader_cls = _load_pdf_reader()
    try:
        reader = reader_cls(source)
    except PermanentProcessingError:
        raise
    except Exception as exc:
        raise InvalidPDFError("The uploaded file is not a valid PDF.") from exc

    if getattr(reader, "is_encrypted", False):
        raise InvalidPDFError("Encrypted PDFs are not supported.")

    raw_pages = list(getattr(reader, "pages", []))
    extracted_pages: list[PageText] = []
    for index, page in enumerate(raw_pages):
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:
            raise InvalidPDFError(
                f"Failed to extract text from PDF page {index + 1}."
            ) from exc
        extracted_pages.append(PageText(page_number=index + 1, text=page_text))

    if not extracted_pages:
        raise InvalidPDFError("The uploaded file is not a valid PDF.")

    text = "\n".join(page.text for page in extracted_pages).strip()
    total_chars = sum(len(page.text) for page in extracted_pages)
    average_text_per_page = total_chars / len(extracted_pages)
    likely_scanned = average_text_per_page < SCANNED_TEXT_THRESHOLD_PER_PAGE
    result = ExtractionResult(
        text=text,
        page_count=len(extracted_pages),
        pages=extracted_pages,
        average_text_per_page=average_text_per_page,
        likely_scanned=likely_scanned,
    )
    logger.info(
        "Extracted %s characters from %s PDF pages (avg %.1f, likely_scanned=%s).",
        len(text),
        result.page_count,
        average_text_per_page,
        likely_scanned,
    )
    return result
