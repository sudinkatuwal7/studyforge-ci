"""Turn chunk texts into one Gemini embedding each.

A list of strings is not sent as one Gemini document. gemini-embedding-2
aggregates a bare list into a single vector, so each text is its own
Content.
"""

from __future__ import annotations

from collections.abc import Sequence

import httpx
from django.conf import settings
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from apps.processing.exceptions import (
    PermanentProcessingError,
    ProcessingError,
    RetryableProcessingError,
)

_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Return one 768-number vector per text, in the same order.

    An empty sequence returns an empty list and does not call Gemini.
    """
    if isinstance(texts, str):
        raise PermanentProcessingError("embed_texts expects a sequence of texts, not one string.")
    if len(texts) == 0:
        return []

    model, dimension, batch_size = _embedding_config()
    client = _make_client()
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = list(texts[start : start + batch_size])
        vectors.extend(_embed_batch(client, batch, model=model, dimension=dimension))
    return vectors


def _embedding_config() -> tuple[str, int, int]:
    key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not str(key).strip():
        raise PermanentProcessingError("GEMINI_API_KEY is not set")

    model = getattr(settings, "EMBEDDING_MODEL", "") or ""
    if not str(model).strip():
        raise PermanentProcessingError("EMBEDDING_MODEL is not set")

    dimension = getattr(settings, "EMBEDDING_DIMENSION", None)
    batch_size = getattr(settings, "EMBEDDING_BATCH_SIZE", None)
    if not isinstance(dimension, int) or isinstance(dimension, bool) or dimension <= 0:
        raise PermanentProcessingError("EMBEDDING_DIMENSION must be a positive integer")
    if not isinstance(batch_size, int) or isinstance(batch_size, bool) or batch_size <= 0:
        raise PermanentProcessingError("EMBEDDING_BATCH_SIZE must be a positive integer")
    return str(model), dimension, batch_size


def _make_client():
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _embed_batch(client, batch: list[str], *, model: str, dimension: int) -> list[list[float]]:
    contents = [
        types.Content(parts=[types.Part(text=text)])
        for text in batch
    ]
    try:
        response = client.models.embed_content(
            model=model,
            contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=dimension),
        )
    except Exception as exc:
        raise _classify_provider_error(exc) from exc
    return _vectors_from_response(response, expected_count=len(batch), dimension=dimension)


def _vectors_from_response(response, *, expected_count: int, dimension: int) -> list[list[float]]:
    embeddings = getattr(response, "embeddings", None)
    returned = 0 if embeddings is None else len(embeddings)
    if embeddings is None or returned != expected_count:
        raise PermanentProcessingError(
            f"Gemini returned {returned} embeddings for {expected_count} texts."
        )

    vectors: list[list[float]] = []
    for embedding in embeddings:
        values = getattr(embedding, "values", None)
        if values is None:
            raise PermanentProcessingError("Gemini embedding response had no values.")
        vector = [float(value) for value in values]
        if len(vector) != dimension:
            raise PermanentProcessingError(
                f"Gemini embedding length {len(vector)} did not match dimension {dimension}."
            )
        vectors.append(vector)
    return vectors


def _classify_provider_error(exc: Exception) -> ProcessingError:
    if _is_retryable(exc):
        return RetryableProcessingError(f"Gemini embedding request failed temporarily: {exc}")
    return PermanentProcessingError(f"Gemini embedding request failed: {exc}")


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)):
        return True
    if isinstance(exc, genai_errors.ServerError):
        return True
    if isinstance(exc, genai_errors.APIError) and exc.code in _RETRYABLE_STATUS_CODES:
        return True
    return False
