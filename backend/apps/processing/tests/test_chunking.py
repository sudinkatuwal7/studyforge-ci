"""Unit tests for character-window page chunking. No model or database."""

from __future__ import annotations

import unittest

from apps.processing.chunking import TextChunk, chunk_page, chunk_pages
from apps.processing.constants import CHUNK_OVERLAP, CHUNK_SIZE
from apps.processing.pdf_parser import PageText


def _marked(length: int) -> str:
    """Return a length-exact string whose slices identify their position."""
    return "".join(f"{index:05d}" for index in range(length))[:length]


class ChunkPageTests(unittest.TestCase):
    def test_short_page_is_one_chunk_with_same_text(self):
        text = "A" * 500
        chunks = chunk_page(PageText(page_number=1, text=text))

        self.assertEqual(chunks, [TextChunk(page_number=1, content=text)])

    def test_page_numbers_stay_on_their_own_page(self):
        page_one = "only-on-page-one " * 40
        page_two = _marked(2000)
        chunks = chunk_pages(
            [
                PageText(page_number=1, text=page_one),
                PageText(page_number=2, text=page_two),
            ]
        )

        page_one_chunks = [chunk for chunk in chunks if chunk.page_number == 1]
        page_two_chunks = [chunk for chunk in chunks if chunk.page_number == 2]
        self.assertEqual(page_one_chunks, [TextChunk(page_number=1, content=page_one)])
        self.assertEqual(len(page_two_chunks), 3)
        self.assertTrue(all(chunk.page_number == 2 for chunk in page_two_chunks))
        self.assertNotIn("only-on-page-one", "".join(chunk.content for chunk in page_two_chunks))
        self.assertNotIn(page_two[:20], page_one_chunks[0].content)

    def test_long_page_splits_into_windows_no_longer_than_chunk_size(self):
        text = _marked(2500)
        chunks = chunk_page(PageText(page_number=4, text=text))

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk.content) <= CHUNK_SIZE for chunk in chunks))
        self.assertTrue(all(chunk.page_number == 4 for chunk in chunks))

    def test_consecutive_chunks_share_the_configured_overlap(self):
        text = _marked(2000)
        chunks = chunk_page(PageText(page_number=1, text=text))

        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0].content, text[0:1000])
        self.assertEqual(chunks[1].content, text[850:1850])
        self.assertEqual(chunks[0].content[-CHUNK_OVERLAP:], chunks[1].content[:CHUNK_OVERLAP])
        self.assertEqual(chunks[0].content[-CHUNK_OVERLAP:], text[850:1000])
        self.assertEqual(chunks[1].content[-CHUNK_OVERLAP:], chunks[2].content[:CHUNK_OVERLAP])
        self.assertEqual(chunks[1].content[-CHUNK_OVERLAP:], text[1700:1850])

    def test_final_chunk_keeps_the_remainder_and_stops(self):
        text = _marked(2000)
        chunks = chunk_page(PageText(page_number=3, text=text))

        self.assertEqual(chunks[-1].content, text[1700:2000])
        self.assertLess(len(chunks[-1].content), CHUNK_SIZE)
        self.assertEqual(chunks[-1].content, text[len(text) - len(chunks[-1].content) :])
        self.assertEqual(len(chunks), 3)
        self.assertTrue(text.endswith(chunks[-1].content))

    def test_empty_page_produces_no_chunks(self):
        self.assertEqual(chunk_page(PageText(page_number=1, text="")), [])

    def test_whitespace_only_page_produces_no_chunks(self):
        self.assertEqual(chunk_page(PageText(page_number=2, text=" \n\t  ")), [])

    def test_chunk_pages_keeps_page_order_then_window_order(self):
        first = _marked(1000)
        second = _marked(2000)
        chunks = chunk_pages(
            [
                PageText(page_number=1, text=first),
                PageText(page_number=2, text=second),
            ]
        )

        self.assertEqual([chunk.page_number for chunk in chunks], [1, 2, 2, 2])
        self.assertEqual(chunks[0].content, first)
        self.assertEqual(chunks[1].content, second[0:1000])
        self.assertEqual(chunks[2].content, second[850:1850])
        self.assertEqual(chunks[3].content, second[1700:2000])

    def test_overlap_at_least_chunk_size_is_rejected(self):
        page = PageText(page_number=1, text="hello")
        with self.assertRaises(ValueError):
            chunk_page(page, chunk_size=1000, overlap=1000)
        with self.assertRaises(ValueError):
            chunk_page(page, chunk_size=1000, overlap=1001)

    def test_exact_chunk_size_is_one_chunk(self):
        text = "B" * CHUNK_SIZE
        chunks = chunk_page(PageText(page_number=1, text=text))
        self.assertEqual(chunks, [TextChunk(page_number=1, content=text)])

    def test_one_past_chunk_size_makes_a_second_window(self):
        text = _marked(CHUNK_SIZE + 1)
        chunks = chunk_page(PageText(page_number=5, text=text))
        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0].content, text[0:CHUNK_SIZE])
        self.assertEqual(chunks[1].content, text[CHUNK_SIZE - CHUNK_OVERLAP :])
        self.assertEqual(chunks[1].page_number, 5)
