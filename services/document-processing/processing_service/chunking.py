"""Split normalized document units into overlapping character windows."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .document_parser import TextUnit

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


@dataclass(frozen=True)
class TextChunk:
    """A character window originating from one source location."""

    page_number: int
    content: str


def chunk_pages(
    pages: Iterable[TextUnit],
    *,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    """Chunk each page independently, preserving page and window order."""
    chunks: list[TextChunk] = []
    for page in pages:
        chunks.extend(chunk_page(page, chunk_size=chunk_size, overlap=overlap))
    return chunks


def chunk_page(
    page: TextUnit,
    *,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    """Split one page into fixed-size windows with the requested overlap."""
    _validate_chunk_window(chunk_size, overlap)
    if not page.text.strip():
        return []

    chunks: list[TextChunk] = []
    start = 0
    while start < len(page.text):
        end = min(start + chunk_size, len(page.text))
        content = page.text[start:end]
        if content.strip():
            chunks.append(TextChunk(page_number=page.page_number, content=content))
        if end == len(page.text):
            break
        start = end - overlap
    return chunks


def _validate_chunk_window(chunk_size: int, overlap: int) -> None:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0:
        raise ValueError("overlap cannot be negative")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")
