"""Owner-scoped cosine retrieval over existing document chunk embeddings."""

from __future__ import annotations

import math

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.shortcuts import get_object_or_404
from pgvector.django import CosineDistance

from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.knowledge.scope import question_documents
from apps.processing.embedding_service import embed_texts


EMBEDDING_DIMENSION = 768
EMBEDDING_MODEL = "gemini-embedding-2"
MAX_TOP_K = 10
MAX_SELECTED_DOCUMENTS = 20


def _maximum_cosine_distance() -> float:
    """Return a finite distance bound, with an optional relevance cutoff."""
    minimum_similarity = settings.RETRIEVAL_MIN_COSINE_SIMILARITY
    if minimum_similarity is None:
        return 2.0
    if (
        type(minimum_similarity) not in (int, float)
        or not math.isfinite(minimum_similarity)
        or not -1.0 <= minimum_similarity <= 1.0
    ):
        raise ImproperlyConfigured(
            "RETRIEVAL_MIN_COSINE_SIMILARITY must be null or a finite number between -1 and 1."
        )
    return 1.0 - minimum_similarity


def retrieve_chunks(user, document_id: int, question: str, top_k: int = 5) -> list[dict]:
    """Return the nearest chunks of one owned, READY document.

    Questions use the same unprefixed Gemini input as stored chunk embeddings.
    Results contain the fields accepted by RetrievalResultSerializer; ``score``
    is cosine similarity (one minus the database's cosine distance).
    An empty list means embedding succeeded but no eligible chunks matched;
    provider failures propagate and are never treated as empty results.
    """
    if type(document_id) is not int or document_id <= 0:
        raise ValueError("document_id must be a positive integer")
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a nonempty string")
    if type(top_k) is not int or not 1 <= top_k <= MAX_TOP_K:
        raise ValueError(f"top_k must be an integer between 1 and {MAX_TOP_K}")

    document = get_object_or_404(
        question_documents(user),
        pk=document_id,
        owner=user,
        status=Document.Status.READY,
    )
    return _retrieve_authorized_chunks(user, [document.pk], question, top_k)


def retrieve_chunks_for_documents(
    user, document_ids: list[int], question: str, top_k: int = 5, *, conversation=None
) -> list[dict]:
    """Globally rank chunks from 1–20 unique, owned, READY documents.

    Reject the entire selection before embedding if any document is unavailable.
    Embed the question once, regardless of the number of selected documents.
    """
    if (
        not isinstance(document_ids, list)
        or not 1 <= len(document_ids) <= MAX_SELECTED_DOCUMENTS
        or any(type(document_id) is not int or document_id <= 0 for document_id in document_ids)
        or len(set(document_ids)) != len(document_ids)
    ):
        raise ValueError("document_ids must be a list of 1 to 20 unique positive integers")
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a nonempty string")
    if type(top_k) is not int or not 1 <= top_k <= MAX_TOP_K:
        raise ValueError(f"top_k must be an integer between 1 and {MAX_TOP_K}")

    authorized_ids = list(
        question_documents(user, conversation).filter(
            pk__in=document_ids, status=Document.Status.READY
        ).values_list("pk", flat=True)
    )
    if len(authorized_ids) != len(document_ids):
        raise Http404("No such documents.")
    return _retrieve_authorized_chunks(user, authorized_ids, question, top_k, conversation)


def _retrieve_authorized_chunks(user, document_ids, question, top_k, conversation=None):
    """Share embedding and ranking while rechecking ownership and readiness."""
    if settings.EMBEDDING_MODEL != EMBEDDING_MODEL or settings.EMBEDDING_DIMENSION != EMBEDDING_DIMENSION:
        raise ImproperlyConfigured("Retrieval requires gemini-embedding-2 with 768 dimensions.")
    maximum_distance = _maximum_cosine_distance()

    embeddings = embed_texts([question.strip()])
    if len(embeddings) != 1:
        raise ValueError("The embedding provider must return exactly one question vector.")
    vector = embeddings[0]
    if (
        not isinstance(vector, (list, tuple))
        or len(vector) != EMBEDDING_DIMENSION
        or any(type(value) not in (int, float) or not math.isfinite(value) for value in vector)
        or not any(value != 0 for value in vector)
    ):
        raise ValueError("The question embedding must be a finite, nonzero 768-dimensional vector.")

    allowed_documents = question_documents(user, conversation).filter(
        pk__in=document_ids, status=Document.Status.READY
    ).values("pk")
    chunks = (
        Chunk.objects.filter(
            owner=user,
            document_id__in=allowed_documents,
            document__owner=user,
            document__status=Document.Status.READY,
            embedding__isnull=False,
        )
        .annotate(distance=CosineDistance("embedding", vector))
        # PostgreSQL compares NaN above finite values, so these bounds also
        # exclude undefined cosine distances from legacy all-zero vectors.
        .filter(distance__gte=0.0, distance__lte=maximum_distance)
        .order_by("distance", "id")[:top_k]
    )
    return [
        {
            "chunk_id": chunk.pk,
            "document_id": chunk.document_id,
            "page_number": chunk.page_number,
            "content": chunk.content,
            "score": 1.0 - chunk.distance,
        }
        for chunk in chunks
    ]
