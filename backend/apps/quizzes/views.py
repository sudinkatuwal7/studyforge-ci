import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import Document
from apps.documents.selectors import get_owned_course_documents
from apps.quizzes.llm import LLMError
from apps.quizzes.selectors import (
    get_owned_course,
    get_owned_quiz,
    get_owned_submission,
    get_owned_survival_session,
)
from apps.quizzes.serializers import (
    GenerateQuizSerializer,
    QuizResultSerializer,
    QuizSerializer,
    SubmitQuizSerializer,
    SurvivalAnswerInputSerializer,
    SurvivalAnswerResultSerializer,
    SurvivalSessionSerializer,
)
from apps.quizzes.services import (
    AlreadySubmittedError,
    EmptyDocumentError,
    InvalidOptionError,
    QuestionNotCurrentError,
    SurvivalSessionEndedError,
    answer_survival_question,
    generate_quiz,
    start_survival_session,
    submit_quiz,
)

logger = logging.getLogger(__name__)


def _generate_for_course(request, course_id, create):
    """Validate a generation request and run `create(course, documents,
    num_questions)`, mapping every failure to the same response for both
    quiz modes. Returns (result, None) or (None, error_response)."""
    course = get_owned_course(request.user, course_id)

    serializer = GenerateQuizSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    documents = get_owned_course_documents(request.user, course, data["document_ids"])

    not_ready = [d.pk for d in documents if d.status != Document.Status.READY]
    if not_ready:
        return None, Response(
            {
                "code": "DOCUMENT_NOT_READY",
                "detail": "Some selected materials are still processing or failed.",
                "document_ids": not_ready,
            },
            status=status.HTTP_409_CONFLICT,
        )

    try:
        return create(course, documents, data["num_questions"]), None
    except EmptyDocumentError as exc:
        # READY but no usable text: a document problem, not a model
        # failure, so it gets its own code rather than a 503.
        return None, Response(
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
        return None, Response(
            {
                "code": "QUIZ_GENERATION_FAILED",
                "detail": "The quiz could not be generated right now. Please try again.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class CourseQuizzesView(APIView):
    """POST /api/v1/courses/{course_id}/quizzes/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, course_id):
        quiz, error = _generate_for_course(
            request,
            course_id,
            lambda course, documents, count: generate_quiz(request.user, course, documents, count),
        )
        if error:
            return error
        return Response(QuizSerializer(quiz).data, status=status.HTTP_201_CREATED)


class QuizDetailView(APIView):
    """GET /api/v1/quizzes/{quiz_id}/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, quiz_id):
        quiz = get_owned_quiz(request.user, quiz_id)
        return Response(QuizSerializer(quiz).data, status=status.HTTP_200_OK)


def _already_submitted_response():
    return Response(
        {
            "code": "QUIZ_ALREADY_SUBMITTED",
            "detail": "This quiz has already been submitted.",
        },
        status=status.HTTP_409_CONFLICT,
    )


class QuizSubmitView(APIView):
    """POST /api/v1/quizzes/{quiz_id}/submit/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, quiz_id):
        quiz = get_owned_quiz(request.user, quiz_id)
        # A Survival quiz is answered one question at a time. Grading it
        # here would reveal every answer in the middle of the game.
        if hasattr(quiz, "survival_session"):
            return Response(
                {
                    "code": "QUIZ_IN_SURVIVAL_MODE",
                    "detail": "This quiz is played in Survival mode and cannot be submitted here.",
                    "survival_session_id": quiz.survival_session.pk,
                },
                status=status.HTTP_409_CONFLICT,
            )
        # Checked before validation so a resubmitted stale form gets the
        # real reason, not a field error.
        if hasattr(quiz, "submission"):
            return _already_submitted_response()

        serializer = SubmitQuizSerializer(data=request.data, context={"quiz": quiz})
        serializer.is_valid(raise_exception=True)

        try:
            submit_quiz(quiz, serializer.validated_data["answers"])
        except AlreadySubmittedError:
            return _already_submitted_response()

        # Re-read with answers and questions prefetched for the response.
        submission = get_owned_submission(request.user, quiz.pk)
        return Response(QuizResultSerializer(submission).data, status=status.HTTP_201_CREATED)


class QuizResultsView(APIView):
    """GET /api/v1/quizzes/{quiz_id}/results/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, quiz_id):
        submission = get_owned_submission(request.user, quiz_id)
        return Response(QuizResultSerializer(submission).data, status=status.HTTP_200_OK)


class CourseSurvivalSessionsView(APIView):
    """POST /api/v1/courses/{course_id}/survival-sessions/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, course_id):
        session, error = _generate_for_course(
            request,
            course_id,
            lambda course, documents, count: start_survival_session(
                request.user, course, documents, count
            ),
        )
        if error:
            return error
        # Re-read so the response is built exactly as a later GET would be.
        session = get_owned_survival_session(request.user, session.pk)
        return Response(SurvivalSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SurvivalSessionDetailView(APIView):
    """GET /api/v1/survival-sessions/{session_id}/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = get_owned_survival_session(request.user, session_id)
        return Response(SurvivalSessionSerializer(session).data, status=status.HTTP_200_OK)


def _survival_conflict(code, detail, session):
    """A 409 that carries the real game state, so a stale client can
    redraw itself instead of guessing."""
    return Response(
        {"code": code, "detail": detail, "session": SurvivalSessionSerializer(session).data},
        status=status.HTTP_409_CONFLICT,
    )


def _session_ended_response(session):
    return _survival_conflict(
        "SURVIVAL_SESSION_ENDED", "This Survival game has ended.", session
    )


class SurvivalAnswerView(APIView):
    """POST /api/v1/survival-sessions/{session_id}/answers/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        session = get_owned_survival_session(request.user, session_id)
        # Checked before validation so an answer to a finished game gets
        # the real reason, not a field error.
        if not session.is_active:
            return _session_ended_response(session)

        serializer = SurvivalAnswerInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            answer = answer_survival_question(session.pk, **serializer.validated_data)
        except SurvivalSessionEndedError:
            # Another request ended the game after the check above.
            return _session_ended_response(
                get_owned_survival_session(request.user, session_id)
            )
        except QuestionNotCurrentError:
            return _survival_conflict(
                "QUESTION_NOT_CURRENT",
                "That question is not the one being asked. The game has moved on.",
                get_owned_survival_session(request.user, session_id),
            )
        except InvalidOptionError:
            return Response(
                {"selected_option_index": ["This question has no such option."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session = get_owned_survival_session(request.user, session_id)
        body = SurvivalAnswerResultSerializer(answer).data
        body["session"] = SurvivalSessionSerializer(session).data
        return Response(body, status=status.HTTP_200_OK)
