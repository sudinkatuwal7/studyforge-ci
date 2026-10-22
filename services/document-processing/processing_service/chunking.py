"""Split normalized document units into overlapping character windows."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .document_parser import TextUnit

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
MAX_CONTEXT_PREFIX_LENGTH = 160


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
    """Split one source unit; overlap applies to body text, not its context."""
    _validate_chunk_window(chunk_size, overlap)
    raw_prefix = getattr(page, "context_prefix", "").strip()
    prefix_limit = min(MAX_CONTEXT_PREFIX_LENGTH, max(0, chunk_size - overlap - 2))
    prefix = raw_prefix[:prefix_limit]
    body = page.text
    # Parsers retain the structural marker in text so normalized text stays
    # complete. Move that marker into the prefix before windowing the body.
    if prefix and prefix == raw_prefix:
        if body == prefix:
            body = ""
        elif body.startswith(prefix + "\n"):
            body = body[len(prefix) + 1:]
    if not body.strip():
        return [TextChunk(page_number=page.page_number, content=prefix)] if prefix else []
    body_window = chunk_size - len(prefix) - (1 if prefix else 0)

    chunks: list[TextChunk] = []
    start = 0
    while start < len(body):
        end = min(start + body_window, len(body))
        content = (prefix + "\n" if prefix else "") + body[start:end]
        if content.strip():
            chunks.append(TextChunk(page_number=page.page_number, content=content))
        if end == len(body):
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
