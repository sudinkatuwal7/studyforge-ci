"""StudyForge URL configuration."""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import path
from apps.users.views import LoginView, RefreshView, RegisterView, csrf_cookie
from apps.users.views import MeView

def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    
    path("api/v1/health/", health),

    path("api/v1/auth/register/", RegisterView.as_view()),

    path("api/v1/auth/csrf/", csrf_cookie),

    path("api/v1/auth/token/",LoginView.as_view()),

    path("api/v1/auth/token/refresh/", RefreshView.as_view()),

    path("api/v1/auth/me/", MeView.as_view()),
]
