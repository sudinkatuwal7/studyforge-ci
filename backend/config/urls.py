"""StudyForge URL configuration."""

from apps.documents.internal_views import InternalJobDocumentView, InternalJobResultView
from apps.users.views import (
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    csrf_cookie,
)
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health),
    path(
        "internal/v1/jobs/<str:job_id>/document/",
        InternalJobDocumentView.as_view(),
        name="internal-job-document",
    ),
    path(
        "internal/v1/jobs/<int:job_id>/result/",
        InternalJobResultView.as_view(),
        name="internal-job-result",
    ),
    path("api/v1/", include("apps.notes.urls")),
    path("api/v1/", include("apps.documents.urls")),
    path("api/v1/", include("apps.conversations.urls")),
    path("api/v1/", include("apps.courses.urls")),
    path("api/v1/", include("apps.quizzes.urls")),
    path("api/v1/", include("apps.knowledge.urls")),

    path("api/v1/auth/register/", RegisterView.as_view()),

    path("api/v1/auth/csrf/", csrf_cookie),

    path("api/v1/auth/token/", LoginView.as_view()),

    path("api/v1/auth/token/refresh/", RefreshView.as_view()),

    path("api/v1/auth/me/", MeView.as_view()),

    path("api/v1/auth/logout/", LogoutView.as_view()),
]
