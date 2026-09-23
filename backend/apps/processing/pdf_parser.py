"""PDF text extraction for the processing layer."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from apps.processing.exceptions import InvalidPDFError, PermanentProcessingError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExtractionResult:
    """Text extracted from a PDF."""

    text: str
    page_count: int


def _load_pdf_reader():
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise PermanentProcessingError(
            "pypdf is not installed; PDF extraction is unavailable."
        ) from exc
    return PdfReader


def extract_pdf_text(source: Any) -> ExtractionResult:
    """Extract plain text from a PDF path or file object.

    Permanent failures (invalid/encrypted/empty PDFs) raise InvalidPDFError.
    """
    reader_cls = _load_pdf_reader()
    try:
        reader = reader_cls(source)
    except PermanentProcessingError:
        raise
    except Exception as exc:
        raise InvalidPDFError("The uploaded file is not a valid PDF.") from exc

    if getattr(reader, "is_encrypted", False):
        raise InvalidPDFError("Encrypted PDFs are not supported.")

    pages = list(getattr(reader, "pages", []))
    page_texts: list[str] = []
    for index, page in enumerate(pages):
        try:
            page_texts.append(page.extract_text() or "")
        except Exception as exc:
            raise InvalidPDFError(
                f"Failed to extract text from PDF page {index + 1}."
            ) from exc

    text = "\n".join(page_texts).strip()
    if not text:
        raise InvalidPDFError("PDF has no extractable text.")

    result = ExtractionResult(text=text, page_count=len(pages))
    logger.info("Extracted %s characters from %s PDF pages.", len(text), result.page_count)
    return result
