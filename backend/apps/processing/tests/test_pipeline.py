"""Database-backed SCRUM-18 pipeline tests. Embeddings are fake, not Gemini."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.processing.constants import STATUS_PROCESSING, STATUS_READY
from apps.processing.exceptions import RetryableProcessingError
from apps.processing.pdf_parser import PageText, extract_pdf_text
from apps.processing.services import process_document

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
MEMORY_SENTENCE = "A page fault occurs when the requested page is not in RAM."
EMBEDDING = [0.25] * 768


def _fake_embed(texts):
    return [list(EMBEDDING) for _text in texts]


class PipelineFixtureTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user_model = get_user_model()
        cls.owner = user_model.objects.create(email="pipeline-owner@example.test")
        cls.other = user_model.objects.create(email="pipeline-other@example.test")
        cls.course = Course.objects.create(owner=cls.owner, name="Pipeline course")
        cls.other_course = Course.objects.create(owner=cls.other, name="Other pipeline course")

    def make_document(self, owner, course, title):
        return Document.objects.create(
            owner=owner,
            course=course,
            title=title,
            sha256="b" * 64,
            file="documents/lecture.pdf",
        )

    def process(self, document, *, extract_fn, embed_fn=_fake_embed):
        return process_document(
            document.pk,
            extract_fn=extract_fn,
            embed_fn=embed_fn,
        )

    def test_sample_pdf_keeps_the_known_sentence_on_page_two(self):
        document = self.make_document(self.owner, self.course, "lecture_memory.pdf")

        result = self.process(
            document,
            extract_fn=lambda _document: extract_pdf_text(FIXTURES_DIR / "lecture_memory.pdf"),
        )

        document.refresh_from_db()
        chunks = list(Chunk.objects.filter(document=document).order_by("pk"))
        matches = [chunk for chunk in chunks if MEMORY_SENTENCE in chunk.content]

        self.assertEqual(result["status"], STATUS_READY)
        self.assertFalse(result["skipped"])
        self.assertEqual(document.status, STATUS_READY)
        self.assertTrue(matches)
        self.assertTrue(all(chunk.page_number == 2 for chunk in matches))
        self.assertTrue(
            all(MEMORY_SENTENCE not in chunk.content for chunk in chunks if chunk.page_number != 2)
        )
        self.assertTrue(all(chunk.owner_id == self.owner.pk for chunk in chunks))
        self.assertTrue(all(chunk.document_id == document.pk for chunk in chunks))
        self.assertTrue(all(len(chunk.embedding) == 768 for chunk in chunks))
        self.assertEqual(matches[0].embedding, EMBEDDING)

    def test_processing_replaces_only_this_documents_chunks(self):
        document = self.make_document(self.owner, self.course, "again.pdf")
        other_document = self.make_document(self.other, self.other_course, "kept.pdf")
        stale = Chunk.objects.create(
            owner=document.owner,
            document=document,
            page_number=1,
            content="stale chunk",
            embedding=[0.1] * 768,
        )
        kept = Chunk.objects.create(
            owner=other_document.owner,
            document=other_document,
            page_number=1,
            content="other document chunk",
            embedding=[0.2] * 768,
        )

        self.process(
            document,
            extract_fn=lambda _document: _pages("Fresh page one.", "Fresh page two."),
        )

        stored = list(Chunk.objects.filter(document=document))
        self.assertFalse(Chunk.objects.filter(pk=stale.pk).exists())
        self.assertTrue(Chunk.objects.filter(pk=kept.pk).exists())
        self.assertTrue(stored)
        self.assertTrue(all(chunk.content != "stale chunk" for chunk in stored))
        self.assertTrue(all(chunk.document_id == document.pk for chunk in stored))
        self.assertEqual(kept.content, "other document chunk")

        document.status = Document.Status.PENDING
        document.save(update_fields=["status"])
        first_ids = {chunk.pk for chunk in stored}
        self.process(
            document,
            extract_fn=lambda _document: _pages("Fresh page one.", "Fresh page two."),
        )
        second_ids = set(Chunk.objects.filter(document=document).values_list("pk", flat=True))
        self.assertTrue(second_ids)
        self.assertTrue(first_ids.isdisjoint(second_ids))
        self.assertTrue(Chunk.objects.filter(pk=kept.pk).exists())

    def test_retryable_embedding_failure_does_not_replace_chunks_or_mark_ready(self):
        document = self.make_document(self.owner, self.course, "retry.pdf")
        existing = Chunk.objects.create(
            owner=document.owner,
            document=document,
            page_number=1,
            content="still here",
            embedding=[0.3] * 768,
        )

        def embed_fn(_texts):
            raise RetryableProcessingError("temporary gemini")

        with self.assertRaises(RetryableProcessingError):
            self.process(
                document,
                extract_fn=lambda _document: _pages("page one", "page two"),
                embed_fn=embed_fn,
            )

        document.refresh_from_db()
        self.assertEqual(document.status, STATUS_PROCESSING)
        self.assertNotEqual(document.status, STATUS_READY)
        self.assertEqual(list(Chunk.objects.filter(document=document)), [existing])

    def test_failed_chunk_insert_rolls_back_the_replacement(self):
        document = self.make_document(self.owner, self.course, "rollback.pdf")
        existing = Chunk.objects.create(
            owner=document.owner,
            document=document,
            page_number=1,
            content="kept after rollback",
            embedding=[0.4] * 768,
        )

        with patch(
            "apps.processing.services.Chunk.objects.bulk_create",
            side_effect=RuntimeError("chunk insert failed"),
        ):
            with self.assertRaises(RetryableProcessingError):
                self.process(
                    document,
                    extract_fn=lambda _document: _pages("new page one"),
                )

        document.refresh_from_db()
        self.assertEqual(document.status, STATUS_PROCESSING)
        self.assertEqual(
            list(Chunk.objects.filter(document=document).values_list("content", flat=True)),
            ["kept after rollback"],
        )
        self.assertTrue(Chunk.objects.filter(pk=existing.pk).exists())


def _pages(*texts: str):
    from apps.processing.pdf_parser import ExtractionResult

    pages = [PageText(page_number=index + 1, text=text) for index, text in enumerate(texts)]
    return ExtractionResult(
        text="\n".join(texts),
        page_count=len(pages),
        pages=pages,
    )
