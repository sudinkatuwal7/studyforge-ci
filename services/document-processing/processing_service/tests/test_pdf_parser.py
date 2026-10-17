from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from processing_service.errors import InvalidPDFError, PermanentProcessingError
from processing_service.pdf_parser import extract_pdf_text


class PdfParserTests(unittest.TestCase):
    def test_extracts_text_in_page_order_with_page_metadata(self):
        reader = MagicMock(is_encrypted=False)
        first, second = MagicMock(), MagicMock()
        first.extract_text.return_value = "First page."
        second.extract_text.return_value = "Second page."
        reader.pages = [first, second]

        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            result = extract_pdf_text("lecture.pdf")

        self.assertEqual(result.text, "First page.\nSecond page.")
        self.assertEqual(result.page_count, 2)
        self.assertEqual(
            [(page.page_number, page.text) for page in result.pages],
            [(1, "First page."), (2, "Second page.")],
        )

    def test_encrypted_pdf_is_rejected(self):
        reader = MagicMock(is_encrypted=True, pages=[])
        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("encrypted.pdf")

    def test_invalid_pdf_is_rejected(self):
        def invalid_reader(_source):
            raise ValueError("not a pdf")

        with patch("processing_service.pdf_parser._load_pdf_reader", return_value=invalid_reader):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("notes.pdf")

    def test_empty_pdf_is_rejected(self):
        reader = MagicMock(is_encrypted=False, pages=[])
        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("empty.pdf")

    def test_sparse_pdf_is_flagged_as_likely_scanned(self):
        page = MagicMock()
        page.extract_text.return_value = "short"
        reader = MagicMock(is_encrypted=False, pages=[page])
        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            result = extract_pdf_text("scan.pdf")

        self.assertTrue(result.likely_scanned)
        self.assertEqual(result.average_text_per_page, 5)

    def test_page_extraction_failure_is_reported_as_invalid_pdf(self):
        page = MagicMock()
        page.extract_text.side_effect = ValueError("bad page")
        reader = MagicMock(is_encrypted=False, pages=[page])
        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            return_value=lambda _source: reader,
        ):
            with self.assertRaisesRegex(InvalidPDFError, "page 1"):
                extract_pdf_text("lecture.pdf")

    def test_missing_pypdf_raises_permanent_error(self):
        with patch(
            "processing_service.pdf_parser._load_pdf_reader",
            side_effect=PermanentProcessingError("pypdf missing"),
        ):
            with self.assertRaises(PermanentProcessingError):
                extract_pdf_text("lecture.pdf")
