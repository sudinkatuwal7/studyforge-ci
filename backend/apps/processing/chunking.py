"""Split extracted PDF pages into fixed-size character windows.

Each page is split on its own. Nothing here calls a model, writes a row,
or changes document status.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from apps.processing.constants import CHUNK_OVERLAP, CHUNK_SIZE
from apps.processing.pdf_parser import PageText


@dataclass(frozen=True)
class TextChunk:
    """One character window taken from a single PDF page."""

    page_number: int
    content: str


def chunk_pages(
    pages: Iterable[PageText],
    *,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    """Return chunks in page order, then window order within each page."""
    chunks: list[TextChunk] = []
    for page in pages:
        chunks.extend(chunk_page(page, chunk_size=chunk_size, overlap=overlap))
    return chunks


def chunk_page(
    page: PageText,
    *,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    """Split one page into overlapping character windows.

    An empty or whitespace-only page produces no chunks. Each chunk keeps
    that page's page number.
    """
    _validate_chunk_window(chunk_size, overlap)
    text = page.text
    if not text.strip():
        return []

    chunks: list[TextChunk] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        piece = text[start:end]
        if piece.strip():
            chunks.append(TextChunk(page_number=page.page_number, content=piece))
        if end == length:
            break
        start = end - overlap
    return chunks


def _validate_chunk_window(chunk_size: int, overlap: int) -> None:
    """Reject a window that would not move forward."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0:
        raise ValueError("overlap cannot be negative")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")
