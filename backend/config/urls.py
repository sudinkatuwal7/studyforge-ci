"""StudyForge URL configuration."""

from apps.documents.internal_views import InternalJobDocumentView, InternalJobObjectView, InternalJobResultView
from config.health import live, ready
from apps.users.views import (
    GoogleLoginView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    csrf_cookie,
)
from apps.users.password_reset import (
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordResetValidateView,
)
from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", live),
    path("api/v1/ready/", ready),
    path(
        "internal/v1/jobs/<str:job_id>/document/",
        InternalJobDocumentView.as_view(),
        name="internal-job-document",
    ),
    path(
        "internal/v1/jobs/<str:job_id>/object/",
        InternalJobObjectView.as_view(),
        name="internal-job-object",
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
    path("api/v1/", include("apps.agent.urls")),

    path("api/v1/auth/register/", RegisterView.as_view()),

    path("api/v1/auth/csrf/", csrf_cookie),

    path("api/v1/auth/token/", LoginView.as_view()),

    path("api/v1/auth/google/", GoogleLoginView.as_view()),

    path("api/v1/auth/token/refresh/", RefreshView.as_view()),

    path("api/v1/auth/me/", MeView.as_view()),

    path("api/v1/auth/logout/", LogoutView.as_view()),

    path("api/v1/auth/password-reset/request/", PasswordResetRequestView.as_view()),

    path("api/v1/auth/password-reset/validate/", PasswordResetValidateView.as_view()),

    path("api/v1/auth/password-reset/confirm/", PasswordResetConfirmView.as_view()),
]
