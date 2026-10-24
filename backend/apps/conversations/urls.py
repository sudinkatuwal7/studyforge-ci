from django.db import transaction
from django.urls import path

from apps.conversations.views import (
    ConversationDetailView, ConversationDocumentDetailView,
    ConversationDocumentsView, ConversationListView, ConversationQuestionView,
)


urlpatterns = [
    path("conversations/", ConversationListView.as_view(), name="conversation-list"),
    path("conversations/<str:conversation_id>/", ConversationDetailView.as_view(),
         name="conversation-detail"),
    path("conversations/<str:conversation_id>/documents/",
         transaction.non_atomic_requests(ConversationDocumentsView.as_view()),
         name="conversation-documents"),
    path("conversations/<str:conversation_id>/documents/<str:document_id>/",
         ConversationDocumentDetailView.as_view(), name="conversation-document-detail"),
    path("conversations/<str:conversation_id>/questions/",
         ConversationQuestionView.as_view(), name="conversation-questions"),
]
