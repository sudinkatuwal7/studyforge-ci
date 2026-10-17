import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import Document
from apps.quizzes.llm import LLMError
from apps.quizzes.selectors import get_owned_course, get_owned_course_documents, get_owned_quiz
from apps.quizzes.serializers import GenerateQuizSerializer, QuizSerializer
from apps.quizzes.services import EmptyDocumentError, generate_quiz

logger = logging.getLogger(__name__)


class CourseQuizzesView(APIView):
    """POST /api/v1/courses/{course_id}/quizzes/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, course_id):
        course = get_owned_course(request.user, course_id)

        serializer = GenerateQuizSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        documents = get_owned_course_documents(request.user, course, data["document_ids"])

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
            quiz = generate_quiz(request.user, course, documents, data["num_questions"])
        except EmptyDocumentError as exc:
            # READY but no usable text: a document problem, not a model
            # failure, so it gets its own code rather than a 503.
            return Response(
                {
                    "code": "DOCUMENT_HAS_NO_TEXT",
                    "detail": "No readable text could be extracted from some selected materials.",
                    "document_ids": exc.document_ids,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except LLMError:
            # Upstream outage, rate limit, retired model, or output that failed
            # validation. Nothing was saved, so the student can simply retry.
            logger.exception("Quiz generation failed for course %s", course.pk)
            return Response(
                {
                    "code": "QUIZ_GENERATION_FAILED",
                    "detail": "The quiz could not be generated right now. Please try again.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(QuizSerializer(quiz).data, status=status.HTTP_201_CREATED)


class QuizDetailView(APIView):
    """GET /api/v1/quizzes/{quiz_id}/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, quiz_id):
        quiz = get_owned_quiz(request.user, quiz_id)
        return Response(QuizSerializer(quiz).data, status=status.HTTP_200_OK)
