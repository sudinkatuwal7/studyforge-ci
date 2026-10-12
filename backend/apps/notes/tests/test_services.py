from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.notes.models import StudyGuide
from apps.notes.services import EmptyDocumentError, generate_study_guide

from apps.knowledge.models import Chunk


class GenerateStudyGuideTests(TestCase):
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

    def test_injected_text_bypasses_the_database(self):
        guide = generate_study_guide(self.document, text="Some lecture content.")
        self.assertEqual(guide.document, self.document)
        self.assertTrue(guide.key_concepts)
        self.assertEqual(guide.model_name, "fake")

    def test_blank_text_raises_empty_document_error(self):
        with self.assertRaises(EmptyDocumentError):
            generate_study_guide(self.document, text="   \n\n  ")

    def test_regenerating_replaces_rather_than_duplicates(self):
        """One document, one guide. This proves update_or_create honours the
        OneToOneField instead of raising on the second call."""
        generate_study_guide(self.document, text="First pass.")
        generate_study_guide(self.document, text="Second pass, longer text.")
        self.assertEqual(StudyGuide.objects.filter(document=self.document).count(), 1)

    def test_the_document_text_reaches_the_model(self):
        """The end-to-end check. The fake model reports how many words it was
        handed, which is the only way to prove the real chunk text travelled
        the whole path rather than something empty arriving instead."""
        Chunk.objects.create(
            owner=self.user, document=self.document, page_number=1,
            content="one two three",
        )
        Chunk.objects.create(
            owner=self.user, document=self.document, page_number=2,
            content="four five",
        )

        guide = generate_study_guide(self.document)

        self.assertIn("5 words", guide.summary)