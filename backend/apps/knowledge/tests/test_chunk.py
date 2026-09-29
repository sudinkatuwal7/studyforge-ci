"""Schema checks for Chunk. No embedding provider is called."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, models, transaction
from django.test import TestCase
from pgvector.django import VectorField

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk


class ChunkSchemaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user_model = get_user_model()
        cls.owner = user_model.objects.create(email="chunk-owner@example.test")
        cls.other = user_model.objects.create(email="chunk-other@example.test")
        cls.course = Course.objects.create(owner=cls.owner, name="Chunk course")
        cls.other_course = Course.objects.create(owner=cls.other, name="Other course")
        cls.document = cls.make_document(cls.owner, cls.course, "lecture.pdf")
        cls.other_document = cls.make_document(cls.other, cls.other_course, "other.pdf")

    @staticmethod
    def make_document(owner, course, title):
        return Document.objects.create(
            owner=owner,
            course=course,
            title=title,
            sha256="a" * 64,
            file="documents/lecture.pdf",
        )

    def make_chunk(self, document, page_number=1, content="alpha", embedding=None, owner=None):
        return Chunk.objects.create(
            owner=owner or document.owner,
            document=document,
            page_number=page_number,
            content=content,
            embedding=embedding,
        )

    def test_owner_is_configured_user_foreign_key(self):
        field = Chunk._meta.get_field("owner")
        self.assertIsInstance(field, models.ForeignKey)
        self.assertEqual(field.related_model, get_user_model())
        self.assertEqual(field.remote_field.on_delete, models.CASCADE)
        self.assertEqual(field.remote_field.related_name, "chunks")

    def test_owner_reverse_relationship_and_cascade(self):
        chunk = self.make_chunk(self.document, content="owned")
        kept = self.make_chunk(self.other_document, content="kept")

        self.assertEqual(list(self.owner.chunks.all()), [chunk])

        self.owner.delete()

        self.assertFalse(Chunk.objects.filter(pk=chunk.pk).exists())
        self.assertTrue(Chunk.objects.filter(pk=kept.pk).exists())

    def test_document_foreign_key_allows_many_chunks(self):
        field = Chunk._meta.get_field("document")
        self.assertIsInstance(field, models.ForeignKey)
        self.assertEqual(field.related_model, Document)
        self.assertEqual(field.remote_field.on_delete, models.CASCADE)
        self.assertEqual(field.remote_field.related_name, "chunks")

        first = self.make_chunk(self.document, page_number=1, content="one")
        second = self.make_chunk(self.document, page_number=2, content="two")

        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(self.document.chunks.count(), 2)
        self.assertCountEqual(list(self.document.chunks.all()), [first, second])

    def test_document_delete_removes_chunks_and_keeps_owner(self):
        chunk = self.make_chunk(self.document, content="goes with document")
        kept = self.make_chunk(self.other_document, content="other document")

        self.document.delete()

        self.assertFalse(Chunk.objects.filter(pk=chunk.pk).exists())
        self.assertTrue(get_user_model().objects.filter(pk=self.owner.pk).exists())
        self.assertTrue(Chunk.objects.filter(pk=kept.pk).exists())

    def test_one_based_page_number_persists(self):
        chunk = self.make_chunk(self.document, page_number=1, content="page one")
        chunk.refresh_from_db()
        self.assertEqual(chunk.page_number, 1)

        field = Chunk._meta.get_field("page_number")
        self.assertEqual(field.clean(3, None), 3)

    def test_page_number_below_one_is_rejected(self):
        chunk = self.make_chunk(self.document)
        field = Chunk._meta.get_field("page_number")
        with self.assertRaises(ValidationError):
            field.clean(0, None)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Chunk.objects.filter(pk=chunk.pk).update(page_number=0)

    def test_content_persists(self):
        text = "The mitochondria is the powerhouse of the cell."
        chunk = self.make_chunk(self.document, content=text)
        chunk.refresh_from_db()
        self.assertEqual(chunk.content, text)

    def test_embedding_is_nullable_unsized_vector_field(self):
        field = Chunk._meta.get_field("embedding")
        self.assertIsInstance(field, VectorField)
        self.assertIsNone(field.dimensions)
        self.assertTrue(field.null)

        chunk = self.make_chunk(self.document)
        chunk.refresh_from_db()
        self.assertIsNone(chunk.embedding)

    def test_embedding_round_trip(self):
        short = self.make_chunk(self.document, content="short", embedding=[1.0, 2.0])
        longer = self.make_chunk(
            self.document,
            page_number=2,
            content="longer",
            embedding=[1.0, 2.0, 3.0, 4.0],
        )

        short.refresh_from_db()
        longer.refresh_from_db()
        self.assertEqual(short.embedding, [1.0, 2.0])
        self.assertEqual(longer.embedding, [1.0, 2.0, 3.0, 4.0])

    def test_owner_filter_returns_only_that_user(self):
        own_first = self.make_chunk(self.document, content="mine-1")
        own_second = self.make_chunk(self.document, page_number=2, content="mine-2")
        self.make_chunk(self.other_document, content="theirs")

        found = set(Chunk.objects.filter(owner=self.owner))
        self.assertEqual(found, {own_first, own_second})

    def test_owner_column_is_indexed(self):
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, Chunk._meta.db_table)
        self.assertTrue(
            any(
                item["index"] and item["columns"] == ["owner_id"]
                for item in constraints.values()
            )
        )

    def test_table_has_only_the_chunk_columns(self):
        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(
                cursor, Chunk._meta.db_table
            )
            cursor.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            extension = cursor.fetchone()
            cursor.execute(
                """
                SELECT udt_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = %s
                  AND column_name = 'embedding'
                """,
                [Chunk._meta.db_table],
            )
            embedding_type = cursor.fetchone()

        self.assertEqual(
            {column.name for column in description},
            {"id", "owner_id", "document_id", "page_number", "content", "embedding"},
        )
        self.assertEqual(extension, ("vector",))
        self.assertEqual(embedding_type, ("vector",))
