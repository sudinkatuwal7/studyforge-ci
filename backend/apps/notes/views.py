from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.documents.models import Document

from apps.notes.selectors import get_owned_document
from apps.notes.serializers import StudyGuideSerializer
from apps.notes.services import EmptyDocumentError, generate_study_guide


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

        return Response(StudyGuideSerializer(guide).data, status=status.HTTP_200_OK)