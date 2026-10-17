"""Generate one Gemini embedding for each page-aware text chunk."""

from __future__ import annotations

from collections.abc import Sequence

import httpx
from django.conf import settings
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from .errors import PermanentProcessingError, ProcessingError, RetryableProcessingError

RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Return one configured-dimension vector per input, preserving order."""
    if isinstance(texts, str):
        raise PermanentProcessingError("embed_texts expects a sequence of texts, not one string.")
    if not texts:
        return []

    model, dimension, batch_size, api_key = _embedding_config()
    client = genai.Client(api_key=api_key)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = list(texts[start : start + batch_size])
        vectors.extend(_embed_batch(client, batch, model=model, dimension=dimension))
    return vectors


def _embedding_config() -> tuple[str, int, int, str]:
    api_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    model = str(getattr(settings, "EMBEDDING_MODEL", "") or "").strip()
    dimension = getattr(settings, "EMBEDDING_DIMENSION", None)
    batch_size = getattr(settings, "EMBEDDING_BATCH_SIZE", None)

    if not api_key:
        raise PermanentProcessingError("GEMINI_API_KEY is not set")
    if not model:
        raise PermanentProcessingError("EMBEDDING_MODEL is not set")
    if not isinstance(dimension, int) or isinstance(dimension, bool) or dimension <= 0:
        raise PermanentProcessingError("EMBEDDING_DIMENSION must be a positive integer")
    if not isinstance(batch_size, int) or isinstance(batch_size, bool) or batch_size <= 0:
        raise PermanentProcessingError("EMBEDDING_BATCH_SIZE must be a positive integer")
    return model, dimension, batch_size, api_key


def _embed_batch(
    client,
    batch: list[str],
    *,
    model: str,
    dimension: int,
) -> list[list[float]]:
    contents = [types.Content(parts=[types.Part(text=text)]) for text in batch]
    try:
        response = client.models.embed_content(
            model=model,
            contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=dimension),
        )
    except Exception as exc:
        raise _classify_provider_error(exc) from exc

    embeddings = getattr(response, "embeddings", None)
    returned = 0 if embeddings is None else len(embeddings)
    if returned != len(batch):
        raise PermanentProcessingError(
            f"Gemini returned {returned} embeddings for {len(batch)} texts."
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
    return isinstance(exc, genai_errors.APIError) and exc.code in RETRYABLE_STATUS_CODES
