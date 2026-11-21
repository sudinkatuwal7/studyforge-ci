import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.documents.models import Document
from apps.documents.selectors import get_owned_course_documents

from apps.notes.llm import InvalidLLMOutput, LLMError, NotesMergeTooLargeError
from apps.notes.selectors import get_owned_course, get_owned_document, get_owned_notes, list_owned_notes
from apps.notes.serializers import (
    CourseNotesSerializer,
    CourseNotesSummarySerializer,
    GenerateCourseNotesSerializer,
    NotesLibraryQuerySerializer,
    StudyGuideSerializer,
    UpdateCourseNotesSerializer,
)
from apps.notes.services import (
    EmptyDocumentError,
    EmptyMaterialsError,
    InvalidNotesContent,
    NotesInputTooLargeError,
    generate_course_notes,
    generate_study_guide,
    update_course_notes,
)

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


class CourseNotesView(APIView):
    """POST /api/v1/courses/{course_id}/notes/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, course_id):
        course = get_owned_course(request.user, course_id)

        serializer = GenerateCourseNotesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        documents = get_owned_course_documents(
            request.user, course, serializer.validated_data["document_ids"]
        )

        not_ready = [d.pk for d in documents if d.status != Document.Status.READY]
        if not_ready:
            return Response(
                {
                    "code": "DOCUMENT_NOT_READY",
                    "detail": "Some selected materials are still processing or failed.",
                    "document_ids": not_ready,
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            notes = generate_course_notes(request.user, course, documents, serializer.get_options())
        except EmptyMaterialsError as exc:
            return Response(
                {
                    "code": "DOCUMENT_HAS_NO_TEXT",
                    "detail": "No readable text could be extracted from some selected materials.",
                    "document_ids": exc.document_ids,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except NotesInputTooLargeError:
            return Response(
                {
                    "code": "NOTES_INPUT_TOO_LARGE",
                    "detail": "The selected materials are too long to process together. Select fewer.",
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except NotesMergeTooLargeError:
            # Detailed notes from many batches can outgrow one merge call.
            logger.warning("Partial notes too large to merge for course %s", course.pk)
            return Response(
                {
                    "code": "NOTES_INPUT_TOO_LARGE",
                    "detail": "The selected materials are too long to combine at this detail level. "
                    "Select fewer or choose a lower detail level.",
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        # Below are AI failures, never document failures: the selected materials
        # stay READY and nothing was saved, so the student can simply retry.
        # Both subclass LLMError, so they must be caught before it.
        except InvalidLLMOutput:
            logger.exception("Notes generation returned unusable output for course %s", course.pk)
            return Response(
                {
                    "code": "NOTES_INVALID_OUTPUT",
                    "detail": "The AI returned notes that could not be used. Please try again, "
                    "or choose a lower detail level or fewer materials.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except LLMError:
            # Outage, rate limit, timeout or missing key.
            logger.exception("Notes generation failed for course %s", course.pk)
            return Response(
                {
                    "code": "NOTES_PROVIDER_UNAVAILABLE",
                    "detail": "The AI service is unavailable right now. Please try again in a few minutes.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(CourseNotesSerializer(notes).data, status=status.HTTP_201_CREATED)


class NotesLibraryView(APIView):
    """GET /api/v1/notes/?course={course_id}"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = NotesLibraryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        notes = list_owned_notes(request.user, query.validated_data.get("course"))
        return Response(CourseNotesSummarySerializer(notes, many=True).data, status=status.HTTP_200_OK)


class CourseNotesDetailView(APIView):
    """GET, PATCH and DELETE /api/v1/notes/{notes_id}/

    Another student's notes are a 404, never a 403, so their existence is not
    revealed. PATCH only: the client sends just the fields it changed.
    """

    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get(self, request, notes_id):
        notes = get_owned_notes(request.user, notes_id)
        return Response(CourseNotesSerializer(notes).data, status=status.HTTP_200_OK)

    def patch(self, request, notes_id):
        notes = get_owned_notes(request.user, notes_id)
        serializer = UpdateCourseNotesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            notes = update_course_notes(notes, serializer.validated_data)
        except InvalidNotesContent as exc:
            return Response(
                {"code": "NOTES_INVALID_CONTENT", "detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(CourseNotesSerializer(notes).data, status=status.HTTP_200_OK)

    def delete(self, request, notes_id):
        # NoteSource rows cascade with the notes.
        get_owned_notes(request.user, notes_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
