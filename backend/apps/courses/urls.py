from django.urls import path

from apps.courses.views import CourseCreateView, CourseDetailView

urlpatterns = [
    # Under /api/v1/: GET lists courses and POST creates a course.
    path("courses/", CourseCreateView.as_view(), name="course-create"),
    # GET /api/v1/courses/7/ opens course 7 if the logged-in user owns it.
    path("courses/<int:course_id>/", CourseDetailView.as_view(), name="course-detail"),
]
