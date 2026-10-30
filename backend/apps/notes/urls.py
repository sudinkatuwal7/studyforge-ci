from django.urls import path

from apps.notes.views import CourseNotesDetailView, CourseNotesView, StudyGuideView

urlpatterns = [
    path(
        "documents/<int:document_id>/study-guide/",
        StudyGuideView.as_view(),
        name="study-guide",
    ),
    path(
        "courses/<int:course_id>/notes/",
        CourseNotesView.as_view(),
        name="course-notes",
    ),
    path(
        "notes/<int:notes_id>/",
        CourseNotesDetailView.as_view(),
        name="course-notes-detail",
    ),
]
