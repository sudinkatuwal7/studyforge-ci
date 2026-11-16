from django.urls import path

from apps.quizzes.views import (
    CourseQuizzesView,
    CourseSurvivalSessionsView,
    QuizDetailView,
    QuizResultsView,
    QuizSubmitView,
    SurvivalAnswerView,
    SurvivalSessionDetailView,
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
    path(
        "courses/<int:course_id>/survival-sessions/",
        CourseSurvivalSessionsView.as_view(),
        name="course-survival-sessions",
    ),
    path(
        "survival-sessions/<int:session_id>/",
        SurvivalSessionDetailView.as_view(),
        name="survival-session-detail",
    ),
    path(
        "survival-sessions/<int:session_id>/answers/",
        SurvivalAnswerView.as_view(),
        name="survival-session-answers",
    ),
]
