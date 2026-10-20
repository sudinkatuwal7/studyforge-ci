from __future__ import annotations

import unittest

from processing_service.chunking import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    MAX_CONTEXT_PREFIX_LENGTH,
    TextChunk,
    chunk_page,
    chunk_pages,
)
from processing_service.document_parser import TextUnit
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

    def test_normalized_pdf_unit_keeps_the_original_windows(self):
        text = "x" * 2000
        self.assertEqual(chunk_page(TextUnit(3, text)), chunk_page(PageText(3, text)))

    def test_context_prefix_repeats_without_consuming_body_overlap(self):
        prefix = "[Heading 2] Long section"
        body = "0123456789" * 25
        unit = TextUnit(1, prefix + "\n" + body, prefix)
        chunks = chunk_page(unit, chunk_size=80, overlap=10)
        body_parts = [chunk.content[len(prefix) + 1:] for chunk in chunks]

        self.assertGreater(len(chunks), 2)
        self.assertTrue(all(chunk.content.startswith(prefix + "\n") for chunk in chunks))
        self.assertTrue(all(len(chunk.content) <= 80 for chunk in chunks))
        self.assertEqual(body_parts[0], body[: 80 - len(prefix) - 1])
        self.assertTrue(all(left[-10:] == right[:10] for left, right in zip(body_parts, body_parts[1:])))
        self.assertEqual("".join([body_parts[0], *(part[10:] for part in body_parts[1:])]), body)

    def test_long_prefix_is_bounded_without_dropping_original_title(self):
        prefix = "[Slide 1: " + "long title " * 19 + "]"
        unit = TextUnit(1, prefix + "\n" + "body " * 300, prefix)
        chunks = chunk_page(unit)

        self.assertGreater(len(prefix), MAX_CONTEXT_PREFIX_LENGTH)
        self.assertTrue(all(chunk.content.startswith(prefix[:MAX_CONTEXT_PREFIX_LENGTH]) for chunk in chunks))
        self.assertTrue(all(len(chunk.content) <= CHUNK_SIZE for chunk in chunks))
        self.assertIn(prefix, chunks[0].content)

    def test_short_contextual_unit_is_not_duplicated(self):
        prefix = "[Slide 2: Overview]"
        text = prefix + "\nShort text."
        self.assertEqual(chunk_page(TextUnit(2, text, prefix)), [TextChunk(2, text)])

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
