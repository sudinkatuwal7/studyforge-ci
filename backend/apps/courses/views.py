from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Course
from .serializers import CourseSerializer


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
