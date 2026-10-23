"""Authenticated, query-only RAG question API."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.serializers import RAGQuerySerializer
from apps.knowledge.services import RAGServiceError, answer_question


class RAGQuestionView(APIView):
    """POST /api/v1/rag/questions/ using the existing structured RAG contracts."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RAGQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = answer_question(request.user, data["document_ids"], data["question"])
        except RAGServiceError:
            return Response(
                {
                    "code": "RAG_GENERATION_FAILED",
                    "detail": "The question could not be answered right now. Please try again.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)
