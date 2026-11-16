"""Query-only RAG orchestration; no answer or document writes."""

from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from rest_framework.exceptions import NotAuthenticated

from apps.documents.models import Document
from apps.identity.ownership import owned_conversation
from apps.knowledge.llm import LLMError, generate_answer, validate_answer
from apps.knowledge.models import Chunk
from apps.knowledge.citation_matching import excerpt_matches
from apps.knowledge.retrieval import retrieve_chunks_for_documents
from apps.knowledge.scope import question_documents
from apps.knowledge.serializers import AnswerResultSerializer
from apps.processing.exceptions import ProcessingError


class RAGServiceError(Exception):
    """Safe boundary for provider failures and unverifiable generated output."""


SEARCH_SOURCES = "search_sources"


def _search_trace(document_ids, passages):
    """One trace entry for the one search that ran, broken down by source kind.

    Retrieval embeds the question once and ranks every selected document together,
    so this is a single step, not one per kind. passages_used counts each kind's
    share of the shared top results: 0 can mean "outranked", not "nothing relevant".
    Kinds that were not selected are left out.
    """
    uploads = set(Document.objects.filter(
        pk__in=document_ids, conversation__isnull=False
    ).values_list("pk", flat=True))
    sources = {}
    for kind, ids in (
        ("course_materials", {pk for pk in document_ids if pk not in uploads}),
        ("chat_uploads", uploads),
    ):
        if ids:
            sources[kind] = {
                "documents_searched": len(ids),
                "passages_used": sum(passage["document_id"] in ids for passage in passages),
            }
    return [{"tool": SEARCH_SOURCES, "sources": sources}]


def _authorized_document_ids(user, document_ids, conversation=None):
    authorized_ids = list(
        question_documents(user, conversation).filter(
            pk__in=document_ids, status=Document.Status.READY
        ).values_list("pk", flat=True)
    )
    if len(authorized_ids) != len(document_ids):
        raise Http404("No such documents.")
    return authorized_ids


def answer_question(user, document_ids, question, *, conversation=None):
    """Answer validated RAGQuerySerializer input for an authenticated user.

    All selected documents must be authorized, not just those contributing a
    top-K chunk. Retrieval and generation happen outside database transactions.
    Until the dedicated citation-verification layer lands, fail closed here:
    citations must match both the retrieval snapshot and current owned chunks.
    """
    if not user or not user.is_authenticated:
        raise NotAuthenticated()
    if conversation is not None and owned_conversation(user, conversation.pk) is None:
        raise Http404
    authorized_ids = _authorized_document_ids(user, document_ids, conversation)
    try:
        if conversation is None:
            passages = retrieve_chunks_for_documents(user, authorized_ids, question)
        else:
            passages = retrieve_chunks_for_documents(user, authorized_ids, question,
                                                     conversation=conversation)
    except (ProcessingError, ImproperlyConfigured, ValueError):
        raise RAGServiceError("The question could not be answered right now.") from None
    # Recorded only once the search has really run (a failed search raises above).
    tool_trace = _search_trace(authorized_ids, passages)

    if not passages:
        result = {"status": "INSUFFICIENT_CONTEXT", "answer": None, "citations": []}
    else:
        # Preserve a server-owned snapshot, separate from mutable provider input.
        evidence = [dict(passage) for passage in passages]
        try:
            result = generate_answer(question, [dict(passage) for passage in evidence])
            result = validate_answer(result, evidence)
        except (LLMError, ValueError):
            raise RAGServiceError("The question could not be answered right now.") from None

    # Recheck the entire selection after network calls, including documents that
    # did not contribute evidence. Never derive this allowlist from model output.
    if conversation is not None and owned_conversation(user, conversation.pk) is None:
        raise Http404
    authorized_ids = _authorized_document_ids(user, authorized_ids, conversation)
    if result["citations"]:
        sources = {passage["chunk_id"]: passage for passage in evidence}
        allowed_chunks = question_documents(user, conversation).filter(
            pk__in=authorized_ids, status=Document.Status.READY
        ).values("pk")
        current_chunks = {
            chunk.pk: chunk
            for chunk in Chunk.objects.filter(
                pk__in=[citation["chunk_id"] for citation in result["citations"]],
                owner=user,
                document_id__in=allowed_chunks,
                document__owner=user,
                document__status=Document.Status.READY,
            )
        }
        for citation in result["citations"]:
            source = sources.get(citation["chunk_id"])
            chunk = current_chunks.get(citation["chunk_id"])
            if (
                source is None
                or chunk is None
                or chunk.document_id != citation["document_id"]
                or chunk.page_number != citation["page_number"]
                or chunk.content != source["content"]
                or not excerpt_matches(citation["excerpt"], chunk.content)
            ):
                raise RAGServiceError("The question could not be answered right now.")

    serializer = AnswerResultSerializer(
        data=result,
        context={"user": user, "authorized_document_ids": authorized_ids,
                 "conversation": conversation},
    )
    if not serializer.is_valid():
        raise RAGServiceError("The question could not be answered right now.")
    # Server-built, never from model output; added after validation of the answer.
    return {**serializer.validated_data, "tool_trace": tool_trace}
