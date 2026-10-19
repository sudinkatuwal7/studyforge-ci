from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.knowledge.serializers import (
    AnswerResultSerializer,
    RAGQuerySerializer,
    RetrievalResultSerializer,
)


class RAGSerializerTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(email="rag@example.test", password="password")
        self.other = user_model.objects.create_user(email="other-rag@example.test", password="password")
        self.course = Course.objects.create(owner=self.user, name="RAG")
        other_course = Course.objects.create(owner=self.other, name="Other RAG")
        self.document = self._document(self.user, self.course, "Mine")
        self.other_document = self._document(self.other, other_course, "Theirs")
        self.chunk = Chunk.objects.create(
            owner=self.user,
            document=self.document,
            page_number=2,
            content="A page fault occurs when the requested page is not in RAM.",
        )
        self.other_chunk = Chunk.objects.create(
            owner=self.other,
            document=self.other_document,
            page_number=1,
            content="Private material.",
        )

    @staticmethod
    def _document(owner, course, title):
        return Document.objects.create(
            owner=owner,
            course=course,
            title=title,
            sha256="a" * 64,
            file=f"documents/{title}.pdf",
            status=Document.Status.READY,
        )

    def citation(self, **changes):
        citation = {
            "chunk_id": self.chunk.pk,
            "document_id": self.document.pk,
            "page_number": 2,
            "excerpt": "requested page is not in RAM",
        }
        citation.update(changes)
        return citation

    def context(self):
        return {"user": self.user, "authorized_document_ids": [self.document.pk]}

    def test_query_requires_unique_positive_document_ids(self):
        valid = RAGQuerySerializer(data={"question": "What is a page fault?", "document_ids": [1]})
        duplicate = RAGQuerySerializer(data={"question": "Question", "document_ids": [1, 1]})
        invalid = RAGQuerySerializer(data={"question": "Question", "document_ids": [0]})
        self.assertTrue(valid.is_valid(), valid.errors)
        self.assertFalse(duplicate.is_valid())
        self.assertFalse(invalid.is_valid())

    def test_retrieval_result_keeps_chunk_document_page_and_score(self):
        serializer = RetrievalResultSerializer(
            data={
                "chunk_id": self.chunk.pk,
                "document_id": self.document.pk,
                "page_number": 2,
                "content": self.chunk.content,
                "score": 0.9,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_supported_answer_requires_an_authorized_exact_citation(self):
        serializer = AnswerResultSerializer(
            data={
                "status": "ANSWERED",
                "answer": "A page fault happens when a requested page is absent from RAM.",
                "citations": [self.citation()],
            },
            context=self.context(),
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_citation_rejects_other_user_or_document_or_wrong_provenance(self):
        cases = [
            self.citation(chunk_id=self.other_chunk.pk, document_id=self.other_document.pk),
            self.citation(page_number=1),
            self.citation(excerpt="not in this chunk"),
        ]
        for citation in cases:
            with self.subTest(citation=citation):
                serializer = AnswerResultSerializer(
                    data={"status": "ANSWERED", "answer": "Supported.", "citations": [citation]},
                    context=self.context(),
                )
                self.assertFalse(serializer.is_valid())

    def test_empty_citations_mean_insufficient_context(self):
        insufficient = AnswerResultSerializer(
            data={"status": "INSUFFICIENT_CONTEXT", "answer": None, "citations": []},
            context=self.context(),
        )
        unsupported_answer = AnswerResultSerializer(
            data={"status": "ANSWERED", "answer": "Unsupported.", "citations": []},
            context=self.context(),
        )
        cited_insufficient = AnswerResultSerializer(
            data={"status": "INSUFFICIENT_CONTEXT", "answer": None, "citations": [self.citation()]},
            context=self.context(),
        )
        self.assertTrue(insufficient.is_valid(), insufficient.errors)
        self.assertFalse(unsupported_answer.is_valid())
        self.assertFalse(cited_insufficient.is_valid())
