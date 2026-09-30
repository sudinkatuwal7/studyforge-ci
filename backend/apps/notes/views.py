from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notes.selectors import get_owned_document
from apps.notes.serializers import StudyGuideSerializer
from apps.notes.services import generate_study_guide

# TODO(SCRUM-8): replace with Document.Status.READY once Sudin's
# status constants merge — this local string is a placeholder.
READY = "READY"


class StudyGuideView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, document_id):
        document = get_owned_document(request.user, document_id)

        if document.status != READY:
            return Response(
                {
                    "code": "DOCUMENT_NOT_READY",
                    "detail": "This document is still processing.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        guide = generate_study_guide(document)
        return Response(StudyGuideSerializer(guide).data, status=status.HTTP_200_OK)