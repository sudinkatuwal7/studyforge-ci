"""Authenticated, bounded retrieval of a source PDF from Django."""

from __future__ import annotations

import hashlib
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings

from .errors import PermanentProcessingError, ProcessingError, RetryableProcessingError

MAX_PDF_BYTES = 20 * 1024 * 1024
SOURCE_TIMEOUT_SECONDS = 15


class _RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def fetch_source_pdf(job_id: int, document_id: int, source_sha256: str) -> bytes:
    """Fetch a correlated PDF over the authenticated internal Django endpoint."""
    if not isinstance(job_id, int) or isinstance(job_id, bool) or job_id <= 0:
        raise PermanentProcessingError("job_id must be a positive integer.")
    if not isinstance(document_id, int) or isinstance(document_id, bool) or document_id <= 0:
        raise PermanentProcessingError("document_id must be a positive integer.")
    if not re.fullmatch(r"[0-9a-f]{64}", source_sha256 or ""):
        raise PermanentProcessingError("source_sha256 must be a lowercase SHA-256 digest.")

    base_url = str(getattr(settings, "PROCESSING_DJANGO_API_URL", "") or "").strip()
    token = str(getattr(settings, "PROCESSING_SERVICE_TOKEN", "") or "").strip()
    if not base_url:
        raise PermanentProcessingError("PROCESSING_DJANGO_API_URL is not configured.")
    if not token:
        raise PermanentProcessingError("PROCESSING_SERVICE_TOKEN is not configured.")
    if not base_url.startswith(("https://", "http://")):
        raise PermanentProcessingError("PROCESSING_DJANGO_API_URL must use HTTP or HTTPS.")

    url = urljoin(
        base_url.rstrip("/") + "/",
        f"internal/v1/jobs/{job_id}/document/",
    )
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/pdf",
        },
        method="GET",
    )
    opener = build_opener(_RejectRedirects())
    try:
        with opener.open(request, timeout=SOURCE_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise _response_error(response.status)
            if response.headers.get_content_type() != "application/pdf":
                raise PermanentProcessingError("Django returned a non-PDF source.")
            if response.headers.get("X-Document-ID") != str(document_id):
                raise PermanentProcessingError("Django returned a different document.")
            if response.headers.get("X-Source-SHA256") != source_sha256:
                raise PermanentProcessingError("Django returned a different source digest.")

            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_size = int(content_length)
                except ValueError as exc:
                    raise PermanentProcessingError(
                        "Django returned an invalid source size."
                    ) from exc
                if declared_size < 0:
                    raise PermanentProcessingError("Django returned an invalid source size.")
                if declared_size > MAX_PDF_BYTES:
                    raise PermanentProcessingError(
                        "The source PDF exceeds the processing size limit."
                    )
            pdf_bytes = response.read(MAX_PDF_BYTES + 1)
    except HTTPError as exc:
        raise _response_error(exc.code) from exc
    except URLError as exc:
        raise RetryableProcessingError("Could not retrieve the source PDF from Django.") from exc
    except (TimeoutError, OSError) as exc:
        raise RetryableProcessingError("Could not retrieve the source PDF from Django.") from exc

    if not pdf_bytes:
        raise PermanentProcessingError("Django returned an empty source PDF.")
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise PermanentProcessingError("The source PDF exceeds the processing size limit.")
    if hashlib.sha256(pdf_bytes).hexdigest() != source_sha256:
        raise PermanentProcessingError("The source PDF digest does not match the job.")
    return pdf_bytes


def _response_error(status: int) -> ProcessingError:
    if status in {408, 429} or status >= 500:
        return RetryableProcessingError(
            f"Django source retrieval failed with HTTP status {status}."
        )
    return PermanentProcessingError(
        f"Django rejected source retrieval with HTTP status {status}."
    )
