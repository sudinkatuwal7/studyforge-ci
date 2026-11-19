import logging

from django.db import transaction
from django.db.models import F
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Course, StudySession, TodoItem
from .serializers import (
    CourseSerializer,
    CourseRenameSerializer,
    StudySessionCreateSerializer,
    StudySessionSerializer,
    TodoUpdateSerializer,
    TodoItemSerializer,
)

logger = logging.getLogger(__name__)


class CourseCreateView(APIView):
    # Read the bearer token and require a logged-in user for listing and creation.
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Only return this student's courses, with the newest first.
        courses = Course.objects.filter(owner=request.user).order_by("-created_at")
        serializer = CourseSerializer(courses, many=True) # many=True is used to serialize multiple objects, in this case, courses 
        return Response(serializer.data)

    def post(self, request):
        serializer = CourseSerializer(data=request.data)
        # Validate the form fields before saving anything.
        serializer.is_valid(raise_exception=True)
        # The server chooses the owner from the login, not from the submitted form.
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CourseDetailView(APIView):
    # Opening a course requires the same authentication as listing courses.
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_course(self, request, course_id):
        # Reject IDs outside the database's supported integer range.
        if not 0 < course_id <= 9223372036854775807:
            raise Http404
        # Missing courses and another student's courses both return 404.
        return get_object_or_404(Course, pk=course_id, owner=request.user)

    def get(self, request, course_id):
        return Response(CourseSerializer(self.get_course(request, course_id)).data)

    def patch(self, request, course_id):
        course = self.get_course(request, course_id)
        serializer = CourseRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course.name = serializer.validated_data["name"]
        course.save(update_fields=["name"])
        return Response(CourseSerializer(course).data)

    def delete(self, request, course_id):
        # Course, material, and conversation signals delete private files while
        # the transaction is open. A storage error rolls back the database rows.
        try:
            # Match material deletion: commit this outer transaction before 204.
            # Storage cannot be rolled back if the final database commit fails.
            with transaction.atomic(durable=True):
                if not 0 < course_id <= 9223372036854775807:
                    raise Http404
                course = get_object_or_404(
                    Course.objects.select_for_update(), pk=course_id, owner=request.user
                )
                course.delete()
        except Http404:
            raise
        except Exception:
            logger.exception("Could not delete course %s.", course_id)
            return Response(
                {"detail": "The course could not be deleted. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TodoListCreateView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Show unfinished work first, with undated tasks after dated tasks.
        todos = TodoItem.objects.filter(course__owner=request.user).order_by(
            "is_completed", F("due_date").asc(nulls_last=True), "created_at", "id"
        )
        return Response(TodoItemSerializer(todos, many=True).data)

    def post(self, request):
        serializer = TodoItemSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # get_or_create handles concurrent inserts using the unique database key.
        todo, created = TodoItem.objects.select_related("course").get_or_create(
            creation_key=data["creation_key"],
            defaults={
                "title": data["title"],
                "course": data["course"],
                "due_date": data.get("due_date"),
            },
        )
        if not created and (
            todo.course.owner_id != request.user.pk
            or todo.title != data["title"]
            or todo.course_id != data["course"].pk
            or todo.due_date != data.get("due_date")
        ):
            # Never expose the task associated with another student's key.
            return Response(
                {"detail": "This creation key has already been used for a different task."},
                status=status.HTTP_409_CONFLICT,
            )
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(TodoItemSerializer(todo).data, status=response_status)


class TodoDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_todo(self, request, todo_id):
        if not 0 < todo_id <= 9223372036854775807:
            raise Http404
        return get_object_or_404(TodoItem, pk=todo_id, course__owner=request.user)

    def patch(self, request, todo_id):
        todo = self.get_todo(request, todo_id)
        serializer = TodoUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(todo, field, value)
        todo.save(update_fields=list(serializer.validated_data))
        return Response(TodoItemSerializer(todo).data)

    def delete(self, request, todo_id):
        self.get_todo(request, todo_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudySessionListCreateView(APIView):
    # Validate the bearer token and reject requests without an authenticated user.
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Derive ownership from the token's user, never a submitted user/course filter.
        sessions = StudySession.objects.filter(course__owner=request.user).order_by(
            "date", F("time").asc(nulls_first=True), "id"
        )
        return Response(StudySessionSerializer(sessions, many=True).data)

    def post(self, request):
        # Request context restricts the serializer's course choices to this student.
        serializer = StudySessionCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # The unique creation key prevents duplicate inserts on matching retries.
        session, created = StudySession.objects.select_related("course").get_or_create(
            creation_key=data["creation_key"],
            defaults={
                "title": data["title"],
                "course": data["course"],
                "date": data["date"],
                "time": data.get("time"),
            },
        )
        if not created and (
            session.course.owner_id != request.user.pk
            or session.title != data["title"]
            or session.course_id != data["course"].pk
            or session.date != data["date"]
            or session.time != data.get("time")
        ):
            # A collision must not reveal or modify an existing session.
            return Response(
                {"detail": "This creation key has already been used for a different session."},
                status=status.HTTP_409_CONFLICT,
            )
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(StudySessionSerializer(session).data, status=response_status)


class StudySessionDetailView(APIView):
    # Apply authentication to reading, editing, and deleting individual sessions.
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_session(self, request, session_id):
        if not 0 < session_id <= 9223372036854775807:
            raise Http404
        # Missing and foreign sessions both return 404 without exposing ownership.
        return get_object_or_404(
            StudySession, pk=session_id, course__owner=request.user
        )

    def get(self, request, session_id):
        session = self.get_session(request, session_id)
        return Response(StudySessionSerializer(session).data)

    def patch(self, request, session_id):
        # Check the existing session first; an owned target course cannot grant access.
        session = self.get_session(request, session_id)
        serializer = StudySessionSerializer(
            session, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, session_id):
        session = self.get_session(request, session_id)
        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
