from django.urls import path

from apps.notes.views import StudyGuideView

urlpatterns = [
    path(
        "documents/<int:document_id>/study-guide/",
        StudyGuideView.as_view(),
        name="study-guide",
    ),
]