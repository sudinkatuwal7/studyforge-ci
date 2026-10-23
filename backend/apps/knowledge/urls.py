"""RAG routes mounted under the versioned API prefix."""

from django.urls import path

from apps.knowledge.views import RAGQuestionView


urlpatterns = [
    path("rag/questions/", RAGQuestionView.as_view(), name="rag-questions"),
]
