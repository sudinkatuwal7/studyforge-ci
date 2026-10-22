from __future__ import annotations

import hashlib
from email.message import Message
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from django.test import SimpleTestCase, override_settings

from processing_service.errors import PermanentProcessingError, RetryableProcessingError
from processing_service.source_client import MAX_PDF_BYTES, fetch_source_document, fetch_source_pdf


PDF_BYTES = b"%PDF-1.4 source bytes"
SOURCE_SHA256 = hashlib.sha256(PDF_BYTES).hexdigest()


class FakeResponse:
    status = 200

    def __init__(self, *, body=PDF_BYTES, document_id=42, source_sha256=SOURCE_SHA256):
        self.headers = Message()
        self.headers["Content-Type"] = "application/pdf"
        self.headers["Content-Length"] = str(len(body))
        self.headers["X-Document-ID"] = str(document_id)
        self.headers["X-Source-SHA256"] = source_sha256
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, _size):
        return self._body


@override_settings(
    PROCESSING_DJANGO_API_URL="http://host.docker.internal:8000",
    PROCESSING_SERVICE_TOKEN="shared-test-token",
)
class SourceClientTests(SimpleTestCase):
    def test_fetches_office_source_with_canonical_mime_and_verified_hash(self):
        for mime in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ):
            with self.subTest(mime=mime):
                response = FakeResponse()
                response.headers.replace_header("Content-Type", mime)
                opener = Mock()
                opener.open.return_value = response
                with patch("processing_service.source_client.build_opener", return_value=opener):
                    source = fetch_source_document(19, 42, SOURCE_SHA256)
                self.assertEqual(source.content, PDF_BYTES)
                self.assertEqual(source.mime_type, mime)

    def test_fetches_expected_job_document_and_verifies_digest(self):
        response = FakeResponse()
        opener = Mock()
        opener.open.return_value = response
        with patch("processing_service.source_client.build_opener", return_value=opener):
            result = fetch_source_pdf(19, 42, SOURCE_SHA256)

        self.assertEqual(result, PDF_BYTES)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "http://host.docker.internal:8000/internal/v1/jobs/19/document/")
        self.assertEqual(request.get_header("Authorization"), "Bearer shared-test-token")
        self.assertIn("application/pdf", request.get_header("Accept"))
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 15)

    def test_rejects_hash_mismatch(self):
        response = FakeResponse(body=b"other bytes")
        opener = Mock()
        opener.open.return_value = response
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaisesRegex(PermanentProcessingError, "digest"):
                fetch_source_pdf(19, 42, SOURCE_SHA256)

    def test_rejects_wrong_document_header(self):
        opener = Mock()
        opener.open.return_value = FakeResponse(document_id=99)
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaisesRegex(PermanentProcessingError, "different document"):
                fetch_source_pdf(19, 42, SOURCE_SHA256)

    def test_rejects_non_pdf_response(self):
        response = FakeResponse()
        response.headers.replace_header("Content-Type", "application/octet-stream")
        opener = Mock()
        opener.open.return_value = response
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaisesRegex(PermanentProcessingError, "unsupported source format"):
                fetch_source_pdf(19, 42, SOURCE_SHA256)

    def test_rejects_oversized_response_before_reading_body(self):
        response = FakeResponse(body=b"x")
        response.headers.replace_header("Content-Length", str(MAX_PDF_BYTES + 1))
        response.read = Mock(side_effect=AssertionError("oversized body must not be read"))
        opener = Mock()
        opener.open.return_value = response
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaisesRegex(PermanentProcessingError, "size limit"):
                fetch_source_pdf(19, 42, SOURCE_SHA256)
        response.read.assert_not_called()

    def test_retries_server_failures(self):
        opener = Mock()
        opener.open.side_effect = HTTPError(
            "http://django/internal",
            503,
            "unavailable",
            Message(),
            None,
        )
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaises(RetryableProcessingError):
                fetch_source_pdf(19, 42, SOURCE_SHA256)

    def test_does_not_follow_redirects(self):
        opener = Mock()
        opener.open.side_effect = HTTPError(
            "http://django/internal",
            302,
            "redirect",
            Message(),
            None,
        )
        with patch("processing_service.source_client.build_opener", return_value=opener):
            with self.assertRaises(PermanentProcessingError):
                fetch_source_pdf(19, 42, SOURCE_SHA256)

    def test_rejects_invalid_task_identifiers_and_digest(self):
        for args in ((0, 42, SOURCE_SHA256), (19, 0, SOURCE_SHA256), (19, 42, "bad")):
            with self.subTest(args=args), self.assertRaises(PermanentProcessingError):
                fetch_source_pdf(*args)


@override_settings(PROCESSING_DJANGO_API_URL="", PROCESSING_SERVICE_TOKEN="")
class SourceClientConfigurationTests(SimpleTestCase):
    def test_missing_endpoint_or_token_fails_explicitly(self):
        with self.assertRaisesRegex(PermanentProcessingError, "API_URL"):
            fetch_source_pdf(19, 42, SOURCE_SHA256)

    @override_settings(
        PROCESSING_DJANGO_API_URL="http://host.docker.internal:8000",
        PROCESSING_SERVICE_TOKEN="",
    )
    def test_missing_token_fails_explicitly(self):
        with self.assertRaisesRegex(PermanentProcessingError, "SERVICE_TOKEN"):
            fetch_source_pdf(19, 42, SOURCE_SHA256)
