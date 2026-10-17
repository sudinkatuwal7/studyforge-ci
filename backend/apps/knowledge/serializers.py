"""JSON schemas for the future, query-only RAG API.

These serializers deliberately define contracts only. They do not perform
embedding, similarity search, answer generation, routing, or persistence.
"""

from rest_framework import serializers

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
    never directly from the untrusted answer payload.
    """

    chunk_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    document_id = serializers.IntegerField(min_value=1, max_value=MAX_IDENTIFIER)
    page_number = serializers.IntegerField(min_value=1)
    excerpt = serializers.CharField(trim_whitespace=False, min_length=1)

    def validate(self, attrs):
        user = self.context.get("user")
        authorized_document_ids = self.context.get("authorized_document_ids")
        if user is None or authorized_document_ids is None:
            raise serializers.ValidationError(
                "Citation validation requires an authorized user and document selection."
            )
        if attrs["document_id"] not in set(authorized_document_ids):
            raise serializers.ValidationError("Citation document is not authorized for this query.")

        chunk = Chunk.objects.filter(
            pk=attrs["chunk_id"],
            owner=user,
            document_id=attrs["document_id"],
        ).only("page_number", "content").first()
        if chunk is None:
            raise serializers.ValidationError("Citation chunk is not authorized for this document.")
        if attrs["page_number"] != chunk.page_number:
            raise serializers.ValidationError("Citation page does not match the cited chunk.")
        if attrs["excerpt"] not in chunk.content:
            raise serializers.ValidationError("Citation excerpt is not present in the cited chunk.")
        return attrs


class AnswerResultSerializer(serializers.Serializer):
    """The future answer response, with citations as the support boundary."""

    class Status(serializers.TextChoices):
        ANSWERED = "ANSWERED", "Answered"
        INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT", "Insufficient context"

    status = serializers.ChoiceField(choices=Status.choices)
    answer = serializers.CharField(allow_null=True, allow_blank=False, required=True)
    citations = CitationSerializer(many=True, required=True)

    def validate(self, attrs):
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
