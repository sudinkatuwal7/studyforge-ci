from __future__ import annotations

import unittest

from processing_service.chunking import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    TextChunk,
    chunk_page,
    chunk_pages,
)
from processing_service.pdf_parser import PageText


class ChunkingTests(unittest.TestCase):
    def test_short_page_is_preserved_as_one_chunk(self):
        text = "A short page."
        self.assertEqual(chunk_page(PageText(1, text)), [TextChunk(1, text)])

    def test_long_page_has_expected_overlap_and_page_number(self):
        text = "x" * 2000
        chunks = chunk_page(PageText(3, text))

        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0].content, text[:CHUNK_SIZE])
        self.assertEqual(
            chunks[1].content,
            text[CHUNK_SIZE - CHUNK_OVERLAP : 1850],
        )
        self.assertEqual(chunks[0].content[-CHUNK_OVERLAP:], chunks[1].content[:CHUNK_OVERLAP])
        self.assertEqual([chunk.page_number for chunk in chunks], [3, 3, 3])

    def test_chunking_never_crosses_page_boundaries(self):
        chunks = chunk_pages(
            [
                PageText(1, "first"),
                PageText(2, "second"),
            ]
        )
        self.assertEqual(chunks, [TextChunk(1, "first"), TextChunk(2, "second")])

    def test_blank_page_produces_no_chunks(self):
        self.assertEqual(chunk_page(PageText(2, " \n\t")), [])

    def test_invalid_window_is_rejected(self):
        page = PageText(1, "text")
        for chunk_size, overlap in ((0, 0), (10, -1), (10, 10)):
            with self.subTest(chunk_size=chunk_size, overlap=overlap):
                with self.assertRaises(ValueError):
                    chunk_page(page, chunk_size=chunk_size, overlap=overlap)
