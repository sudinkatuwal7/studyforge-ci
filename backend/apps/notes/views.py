import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.documents.models import Document

from apps.notes.llm import LLMError
from apps.notes.selectors import get_owned_document
from apps.notes.serializers import StudyGuideSerializer
from apps.notes.services import EmptyDocumentError, generate_study_guide
logger = logging.getLogger(__name__)


class StudyGuideView(APIView):
    """POST /api/v1/documents/{document_id}/study-guide/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, document_id):
        document = get_owned_document(request.user, document_id)

        if document.status != Document.Status.READY:
            return Response(
                {
                    "code": "DOCUMENT_NOT_READY",
                    "detail": "This document is still processing.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            guide = generate_study_guide(document)
        except EmptyDocumentError:
            # READY but no usable text: a scanned PDF, or extraction that
            # produced nothing. A document problem, not a model failure,
            # so it gets its own code rather than surfacing as a 500.
            return Response(
                {
                    "code": "DOCUMENT_HAS_NO_TEXT",
                    "detail": "No readable text could be extracted from this document.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        except LLMError:
            # Upstream outage, rate limit, or output that failed validation.
            # Nothing was saved, so the student can simply retry.
            logger.exception("Study guide generation failed for document %s", document.pk)
            return Response(
                {
                    "code": "STUDY_GUIDE_GENERATION_FAILED",
                    "detail": "The study guide could not be generated right now. Please try again.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(StudyGuideSerializer(guide).data, status=status.HTTP_200_OK)
