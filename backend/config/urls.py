"""StudyForge URL configuration."""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import path
from apps.users.views import RegisterView

def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    
    path("api/v1/health/", health),

    path("api/v1/auth/register/", RegisterView.as_view()),
]
