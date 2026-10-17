from django.db.models import F
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Course, TodoItem
from .serializers import CourseSerializer, TodoCompletionSerializer, TodoItemSerializer


class CourseCreateView(APIView):
    # Read the bearer token and require a logged-in user for listing and creation.
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Only return this student's courses, with the newest first.
        courses = Course.objects.filter(owner=request.user).order_by("-created_at")
        serializer = CourseSerializer(courses, many=True)
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

    def get(self, request, course_id):
        # Reject IDs outside the database's supported integer range.
        if not 0 < course_id <= 9223372036854775807:
            raise Http404
        # Missing courses and another student's courses both return 404.
        course = get_object_or_404(Course, pk=course_id, owner=request.user)
        return Response(CourseSerializer(course).data)


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


class TodoCompletionView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def patch(self, request, todo_id):
        if not 0 < todo_id <= 9223372036854775807:
            raise Http404
        todo = get_object_or_404(TodoItem, pk=todo_id, course__owner=request.user)
        serializer = TodoCompletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Only completion can change through this endpoint.
        todo.is_completed = serializer.validated_data["is_completed"]
        todo.save(update_fields=["is_completed"])
        return Response(TodoItemSerializer(todo).data)
