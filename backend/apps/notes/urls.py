from django.urls import path

from apps.notes.views import CourseNotesDetailView, CourseNotesView, NotesLibraryView, StudyGuideView

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
        "notes/",
        NotesLibraryView.as_view(),
        name="notes-library",
    ),
    path(
        "notes/<int:notes_id>/",
        CourseNotesDetailView.as_view(),
        name="course-notes-detail",
    ),
]
