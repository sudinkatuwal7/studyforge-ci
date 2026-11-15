"""Gemini query embeddings for retrieval; document embeddings belong to the worker."""

from __future__ import annotations

from collections.abc import Sequence
import math

import httpx
from django.conf import settings
from google import genai
from google.genai import errors as genai_errors
from google.genai import types


_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


class QueryEmbeddingError(Exception):
    """The question could not be embedded."""

    retryable = False


class RetryableQueryEmbeddingError(QueryEmbeddingError):
    retryable = True


class PermanentQueryEmbeddingError(QueryEmbeddingError):
    pass


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Embed the one question supplied by retrieval using the worker's input format."""
    if isinstance(texts, str) or len(texts) != 1 or not isinstance(texts[0], str):
        raise PermanentQueryEmbeddingError("Query embedding requires exactly one text.")

    api_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    model = str(getattr(settings, "EMBEDDING_MODEL", "") or "").strip()
    dimension = getattr(settings, "EMBEDDING_DIMENSION", None)
    if not api_key:
        raise PermanentQueryEmbeddingError("GEMINI_API_KEY is not set")
    if not model:
        raise PermanentQueryEmbeddingError("EMBEDDING_MODEL is not set")
    if not isinstance(dimension, int) or isinstance(dimension, bool) or dimension <= 0:
        raise PermanentQueryEmbeddingError("EMBEDDING_DIMENSION must be a positive integer")

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.embed_content(
            model=model,
            contents=[types.Content(parts=[types.Part(text=texts[0])])],
            config=types.EmbedContentConfig(output_dimensionality=dimension),
        )
    except Exception as exc:
        if _is_retryable(exc):
            raise RetryableQueryEmbeddingError(
                f"Gemini embedding request failed temporarily: {exc}"
            ) from exc
        raise PermanentQueryEmbeddingError(f"Gemini embedding request failed: {exc}") from exc

    embeddings = getattr(response, "embeddings", None)
    if embeddings is None or len(embeddings) != 1:
        raise PermanentQueryEmbeddingError("Gemini must return exactly one question embedding.")
    values = getattr(embeddings[0], "values", None)
    if values is None:
        raise PermanentQueryEmbeddingError("Gemini embedding response had no values.")
    try:
        vector = [float(value) for value in values]
    except (TypeError, ValueError, OverflowError) as exc:
        raise PermanentQueryEmbeddingError("Gemini returned an invalid embedding.") from exc
    if len(vector) != dimension or not all(math.isfinite(value) for value in vector) or not any(vector):
        raise PermanentQueryEmbeddingError("Gemini returned an invalid embedding.")
    return [vector]


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)):
        return True
    if isinstance(exc, genai_errors.ServerError):
        return True
    return isinstance(exc, genai_errors.APIError) and exc.code in _RETRYABLE_STATUS_CODES
