from unittest import skipIf

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.notes.selectors import get_ordered_chunks
from apps.notes.services import EmptyDocumentError, generate_study_guide

try:
    from apps.knowledge.models import Chunk
except ImportError:  # pragma: no cover
    Chunk = None


@skipIf(Chunk is None, "Needs the Chunk model from SCRUM-17 (not merged yet)")
class ContentRetrievalTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.document = Document.objects.create(
            owner=self.user,
            course=self.course,
            title="Lecture 07",
            sha256="a" * 64,
            file="documents/2026/09/lecture07.pdf",
            status=Document.Status.READY,
            page_count=12,
        )

    def _chunk(self, page, content):
        return Chunk.objects.create(
            owner=self.user,
            document=self.document,
            page_number=page,
            content=content,
        )

    def test_chunks_come_back_in_page_order(self):
        """Inserted out of order on purpose. A summary of a whole document
        depends on reading order, so this is not incidental."""
        self._chunk(3, "Third.")
        self._chunk(1, "First.")
        self._chunk(2, "Second.")

        self.assertEqual(
            [c.content for c in get_ordered_chunks(self.document)],
            ["First.", "Second.", "Third."],
        )

    def test_chunks_on_one_page_keep_creation_order(self):
        """Chunk has no sequence field (SCRUM-17), so ordering within a page
        falls back to primary key. This pins that assumption: if the chunker
        ever inserts a page out of order, this test is what catches it."""
        self._chunk(1, "Top of page one.")
        self._chunk(1, "Bottom of page one.")

        self.assertEqual(
            [c.content for c in get_ordered_chunks(self.document)],
            ["Top of page one.", "Bottom of page one."],
        )

    def test_document_with_no_chunks_raises(self):
        with self.assertRaises(EmptyDocumentError):
            generate_study_guide(self.document)