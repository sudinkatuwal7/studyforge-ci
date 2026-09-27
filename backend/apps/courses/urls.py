from django.urls import path

from apps.courses.views import CourseCreateView

urlpatterns = [
    path("courses/", CourseCreateView.as_view(), name="course-create"),
]
