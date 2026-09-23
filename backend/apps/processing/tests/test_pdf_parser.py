"""PDF parser unit tests. The heavy pypdf dependency is mocked."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

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

    def test_empty_text_layer_is_rejected(self):
        page = MagicMock()
        page.extract_text.return_value = "   "
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [page]
        with patch("apps.processing.pdf_parser._load_pdf_reader", return_value=lambda _src: reader):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text("scan.pdf")

    def test_missing_pypdf_is_permanent(self):
        with patch("apps.processing.pdf_parser._load_pdf_reader") as load_reader:
            load_reader.side_effect = PermanentProcessingError("pypdf is not installed")
            with self.assertRaises(PermanentProcessingError):
                extract_pdf_text("lecture.pdf")
