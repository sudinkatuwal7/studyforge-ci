from django.db import transaction
from django.urls import path

from apps.conversations.views import (
    ConversationDetailView, ConversationDocumentDetailView,
    ConversationDocumentsView, ConversationListView, ConversationMessagesView,
    ConversationQuestionView, QuestionRetryView,
)
from apps.conversations.voice import VoiceTranscriptionView


urlpatterns = [
    path("voice/transcriptions/", VoiceTranscriptionView.as_view(), name="voice-transcription"),
    path("conversations/", ConversationListView.as_view(), name="conversation-list"),
    path("conversations/<str:conversation_id>/", ConversationDetailView.as_view(),
         name="conversation-detail"),
    path("conversations/<str:conversation_id>/documents/",
         transaction.non_atomic_requests(ConversationDocumentsView.as_view()),
         name="conversation-documents"),
    path("conversations/<str:conversation_id>/documents/<str:document_id>/",
         ConversationDocumentDetailView.as_view(), name="conversation-document-detail"),
    path("conversations/<str:conversation_id>/messages/",
         ConversationMessagesView.as_view(), name="conversation-messages"),
    # Both question routes are non-atomic so the AI call never runs inside a
    # request-wide transaction.
    path("conversations/<str:conversation_id>/questions/",
         transaction.non_atomic_requests(ConversationQuestionView.as_view()),
         name="conversation-questions"),
    path("conversations/<str:conversation_id>/messages/<str:message_id>/retry/",
         transaction.non_atomic_requests(QuestionRetryView.as_view()),
         name="conversation-question-retry"),
]
