from django.urls import path

from apps.quizzes.views import (
    CourseQuizzesView,
    QuizDetailView,
    QuizResultsView,
    QuizSubmitView,
)

urlpatterns = [
    path(
        "courses/<int:course_id>/quizzes/",
        CourseQuizzesView.as_view(),
        name="course-quizzes",
    ),
    path("quizzes/<int:quiz_id>/", QuizDetailView.as_view(), name="quiz-detail"),
    path("quizzes/<int:quiz_id>/submit/", QuizSubmitView.as_view(), name="quiz-submit"),
    path("quizzes/<int:quiz_id>/results/", QuizResultsView.as_view(), name="quiz-results"),
]
