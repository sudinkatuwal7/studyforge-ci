from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from processing_service.chunking import chunk_pages
from processing_service.errors import InvalidPDFError
from processing_service.pdf_parser import extract_pdf_text


class ExtractionChunkingPipelineTests(unittest.TestCase):
    def test_extracted_pages_are_chunked_without_crossing_page_boundaries(self):
        first_page_text = "A" * 1200
        second_page_text = "The second page stays separate."
        reader = MagicMock(is_encrypted=False)
        first_page, second_page = MagicMock(), MagicMock()
        first_page.extract_text.return_value = first_page_text
        second_page.extract_text.return_value = second_page_text
        reader.pages = [first_page, second_page]

        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            extraction = extract_pdf_text("lecture.pdf")

        chunks = chunk_pages(extraction.pages)

        self.assertEqual(extraction.page_count, 2)
        self.assertEqual([chunk.page_number for chunk in chunks], [1, 1, 2])
        self.assertEqual(chunks[0].content, first_page_text[:1000])
        self.assertEqual(chunks[1].content, first_page_text[850:])
        self.assertEqual(chunks[2].content, second_page_text)
        self.assertTrue(all(chunk.page_number == 1 for chunk in chunks[:2]))
        self.assertNotIn(second_page_text, "".join(chunk.content for chunk in chunks[:2]))

    def test_page_extraction_failure_propagates_as_invalid_pdf(self):
        page = MagicMock()
        page.extract_text.side_effect = ValueError("corrupt page content")
        reader = MagicMock(is_encrypted=False, pages=[page])

        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            with self.assertRaisesRegex(InvalidPDFError, "page 1"):
                extraction = extract_pdf_text("broken.pdf")
                chunk_pages(extraction.pages)
