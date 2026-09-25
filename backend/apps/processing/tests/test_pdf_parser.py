"""PDF parser unit tests. The heavy pypdf dependency is mocked."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from apps.processing.constants import SCANNED_TEXT_THRESHOLD_PER_PAGE
from apps.processing.exceptions import InvalidPDFError, PermanentProcessingError
from apps.processing.pdf_parser import extract_pdf_text


class PdfParserTests(unittest.TestCase):
    def test_extracts_text_and_page_count(self):
        page_one = MagicMock()
        page_one.extract_text.return_value = "Chapter 1"
        page_two = MagicMock()
        page_two.extract_text.return_value = "Chapter 2"
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [page_one, page_two]

        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            result = extract_pdf_text("lecture.pdf")

        self.assertEqual(result.page_count, 2)
        self.assertIn("Chapter 1", result.text)
        self.assertIn("Chapter 2", result.text)

    def test_invalid_pdf_raises_permanent_error(self):
        def boom(_source):
            raise ValueError("not a pdf")

        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=boom):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("notes.docx")

    def test_encrypted_pdf_is_rejected(self):
        reader = MagicMock()
        reader.is_encrypted = True
        reader.pages = []
        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("secret.pdf")

    def test_empty_text_layer_is_likely_scanned(self):
        page = MagicMock()
        page.extract_text.return_value = "   "
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [page]
        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            result = extract_pdf_text("scan.pdf")

        self.assertTrue(result.likely_scanned)
        self.assertEqual(result.page_count, 1)
        self.assertEqual(result.pages[0].page_number, 1)

    def test_sparse_text_is_flagged_as_likely_scanned(self):
        page = MagicMock()
        page.extract_text.return_value = "hi"
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [page]
        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            result = extract_pdf_text("scan.pdf")

        self.assertLess(result.average_text_per_page, SCANNED_TEXT_THRESHOLD_PER_PAGE)
        self.assertTrue(result.likely_scanned)

    def test_dense_text_is_not_flagged_as_scanned(self):
        page = MagicMock()
        page.extract_text.return_value = "A" * 200
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [page]
        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            result = extract_pdf_text("lecture.pdf")

        self.assertFalse(result.likely_scanned)
        self.assertGreaterEqual(result.average_text_per_page, SCANNED_TEXT_THRESHOLD_PER_PAGE)

    def test_missing_pypdf_is_permanent(self):
        with patch("apps.processing.pdf_parser._load_pdf_reader") as load_reader:
            load_reader.side_effect = PermanentProcessingError("pypdf is not installed")
            with self.assertRaises(PermanentProcessingError):
                extract_pdf_text("lecture.pdf")
