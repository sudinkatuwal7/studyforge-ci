"""Authenticated, bounded status and result delivery to Django."""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from django.conf import settings

from .errors import PermanentProcessingError, ProcessingError, RetryableProcessingError

MAX_RESULT_BYTES = 2 * 1024 * 1024
RESULT_TIMEOUT_SECONDS = 30


def submit_callback(job_id: int, payload: dict) -> str:
    base_url = str(getattr(settings, "PROCESSING_DJANGO_API_URL", "") or "").strip()
    token = str(getattr(settings, "PROCESSING_SERVICE_TOKEN", "") or "").strip()
    if not base_url or not token:
        raise PermanentProcessingError("Django callback URL and service token must be configured.")
    if not base_url.startswith(("https://", "http://")):
        raise PermanentProcessingError("PROCESSING_DJANGO_API_URL must use HTTP or HTTPS.")

    if payload.get("schema_version") != 1 or payload.get("job_id") != job_id:
        raise PermanentProcessingError("The callback envelope is invalid.")
    try:
        body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise PermanentProcessingError("The callback payload is not valid JSON.") from exc
    if len(body) > MAX_RESULT_BYTES:
        raise PermanentProcessingError("The processing result exceeds the callback size limit.")

    url = urljoin(base_url.rstrip("/") + "/", f"internal/v1/jobs/{job_id}/result/")
    request = Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=RESULT_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise _response_error(response.status)
            try:
                result = json.loads(response.read(4096))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise PermanentProcessingError(
                    "Django returned an invalid processing callback response."
                ) from exc
            outcome = result.get("status") if isinstance(result, dict) else None
            if outcome not in {"applied", "duplicate", "terminal", "stale"}:
                raise PermanentProcessingError(
                    "Django returned an unknown processing callback outcome."
                )
            return outcome
    except HTTPError as exc:
        raise _response_error(exc.code) from exc
    except URLError as exc:
        raise RetryableProcessingError("Could not submit the processing result to Django.") from exc
    except (TimeoutError, OSError) as exc:
        raise RetryableProcessingError("Could not submit the processing result to Django.") from exc


def _response_error(status: int) -> ProcessingError:
    if status in {408, 429} or status >= 500:
        return RetryableProcessingError(
            f"Django processing callback failed with HTTP status {status}."
        )
    return PermanentProcessingError(
        f"Django rejected the processing callback with HTTP status {status}."
    )
