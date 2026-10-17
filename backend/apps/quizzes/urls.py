from django.urls import path

from apps.quizzes.views import CourseQuizzesView, QuizDetailView

urlpatterns = [
    path(
        "courses/<int:course_id>/quizzes/",
        CourseQuizzesView.as_view(),
        name="course-quizzes",
    ),
    path("quizzes/<int:quiz_id>/", QuizDetailView.as_view(), name="quiz-detail"),
]
