from django.db import transaction
from django.urls import path

from apps.documents.views import DocumentDetailView, DocumentUploadView


urlpatterns = [
    # String converters let the authenticated view return contract JSON for bad IDs.
    path(
        "courses/<str:course_id>/documents/",
        transaction.non_atomic_requests(DocumentUploadView.as_view()),
        name="document-upload",
    ),
    path("documents/<str:document_id>/", DocumentDetailView.as_view(), name="document-detail"),
]
