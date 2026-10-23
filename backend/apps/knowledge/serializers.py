"""Request and final response validation for the query-only RAG API.

These serializers deliberately define contracts only. They do not perform
embedding, similarity search, answer generation, routing, or persistence.
"""

from django.db import models
from rest_framework import serializers

from apps.documents.models import Document
from apps.knowledge.models import Chunk


MAX_IDENTIFIER = 9_223_372_036_854_775_807
MAX_SELECTED_DOCUMENTS = 20


class RAGQuerySerializer(serializers.Serializer):
    """A question and the documents the caller explicitly selected."""

    question = serializers.CharField(trim_whitespace=True, min_length=1, max_length=2_000)
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER),
        allow_empty=False,
        max_length=MAX_SELECTED_DOCUMENTS,
    )

    def validate_document_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Each document can be selected only once.")
        return value


class RetrievalResultSerializer(serializers.Serializer):
    """One authorized chunk selected as evidence by future retrieval code."""

    chunk_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    document_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    page_number = serializers.IntegerField(min_value=1)
    content = serializers.CharField(trim_whitespace=False, min_length=1)
    score = serializers.FloatField()


class CitationSerializer(serializers.Serializer):
    """A claim's exact, authorized source excerpt.

    Callers must supply ``user`` and ``authorized_document_ids`` in serializer
    context. The latter must come from the owner-scoped document selection,
    never directly from the untrusted answer payload. The endpoint's service and
    generator additionally enforce the exact retrieved chunk-ID allowlist;
    document authorization alone is not proof that a chunk was retrieved.
    """

    chunk_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    document_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    page_number = serializers.IntegerField(min_value=1)
    excerpt = serializers.CharField(trim_whitespace=False, min_length=1)

    def validate(self, attrs):
        user = self.context.get("user")
        authorized_document_ids = self.context.get("authorized_document_ids")
        if user is None or not user.is_authenticated or authorized_document_ids is None:
            raise serializers.ValidationError(
                "Citation validation requires an authorized user and document selection."
            )
        if attrs["document_id"] not in set(authorized_document_ids):
            raise serializers.ValidationError("Citation document is not authorized for this query.")

        chunk = Chunk.objects.filter(
            pk=attrs["chunk_id"],
            owner=user,
            document_id=attrs["document_id"],
            document__owner=user,
            document__status=Document.Status.READY,
        ).only("page_number", "content").first()
        if chunk is None:
            raise serializers.ValidationError("Citation chunk is not authorized for this document.")
        if attrs["page_number"] != chunk.page_number:
            raise serializers.ValidationError("Citation page does not match the cited chunk.")
        if not attrs["excerpt"].strip() or attrs["excerpt"] not in chunk.content:
            raise serializers.ValidationError("Citation excerpt is not present in the cited chunk.")
        return {
            "chunk_id": chunk.pk,
            "document_id": chunk.document_id,
            "page_number": chunk.page_number,
            "excerpt": attrs["excerpt"],
        }


class AnswerResultSerializer(serializers.Serializer):
    """Final answer response, with current source ownership/readiness checks."""

    class Status(models.TextChoices):
        ANSWERED = "ANSWERED", "Answered"
        INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT", "Insufficient context"

    status = serializers.ChoiceField(choices=Status.choices)
    answer = serializers.CharField(allow_null=True, allow_blank=False, required=True)
    citations = CitationSerializer(many=True, required=True)

    def validate(self, attrs):
        user = self.context.get("user")
        selected_ids = self.context.get("authorized_document_ids")
        if user is None or not user.is_authenticated or not selected_ids:
            raise serializers.ValidationError("Answer validation requires an authorized document selection.")
        # Run after nested citation validation, including for abstentions and
        # selected documents that did not contribute a cited top-K chunk.
        authorized_ids = set(
            Document.objects.filter(
                pk__in=selected_ids, owner=user, status=Document.Status.READY
            ).values_list("pk", flat=True)
        )
        if authorized_ids != set(selected_ids):
            raise serializers.ValidationError("Selected documents are no longer available.")
        status = attrs["status"]
        answer = attrs["answer"]
        citations = attrs["citations"]
        if status == self.Status.ANSWERED:
            if answer is None:
                raise serializers.ValidationError({"answer": "Supported answers require text."})
            if not citations:
                raise serializers.ValidationError(
                    {"citations": "Supported answers require at least one citation."}
                )
        else:
            if answer is not None:
                raise serializers.ValidationError(
                    {"answer": "Insufficient-context responses must not contain an answer."}
                )
            if citations:
                raise serializers.ValidationError(
                    {"citations": "Insufficient-context responses must have no citations."}
                )
        return attrs
