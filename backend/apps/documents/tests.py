"""Schema checks only; upload and processing behavior are tested elsewhere."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from apps.courses.models import Course
from apps.documents.models import Document, Job


class DocumentSchemaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = get_user_model().objects.create(email="schema@example.test")
        cls.course = Course.objects.create(owner=cls.owner, name="Schema checks")

    def make_document(self):
        # A storage name exercises the schema without creating or parsing a file.
        return Document.objects.create(
            owner=self.owner,
            course=self.course,
            title="lecture.pdf",
            sha256="a" * 64,
            file="documents/lecture.pdf",
        )

    def test_defaults_and_multiple_runs(self):
        document = self.make_document()
        document.refresh_from_db()
        self.assertEqual(document.status, Document.Status.PENDING)
        self.assertIsNone(document.error_code)
        self.assertIsNone(document.page_count)
        self.assertEqual(document.created_at, document.updated_at)
        self.assertEqual(document.owner_id, document.course.owner_id)

        first = Job.objects.create(document=document)
        second = Job.objects.create(document=document)
        first.refresh_from_db()
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(document.jobs.count(), 2)
        self.assertEqual(first.type, Job.Type.DOCUMENT_PROCESSING)
        self.assertEqual(first.status, Job.Status.QUEUED)
        self.assertEqual(first.attempts, 0)
        self.assertIsNone(first.run_after)
        # A digest identifies content; it does not prohibit another upload.
        self.assertNotEqual(self.make_document().pk, document.pk)

    def test_document_database_constraints(self):
        document = self.make_document()
        for values in (
            {"status": "UNKNOWN"},
            {"error_code": "RAW_EXCEPTION"},
            {"page_count": 0},
            {"page_count": -1},
        ):
            with self.subTest(values=values), self.assertRaises(IntegrityError):
                with transaction.atomic():
                    Document.objects.filter(pk=document.pk).update(**values)

        document.page_count = 1
        document.status = Document.Status.FAILED
        document.error_code = Document.ErrorCode.PROCESSING_DISPATCH_FAILED
        document.save()
        document.refresh_from_db()
        self.assertEqual(document.error_code, "PROCESSING_DISPATCH_FAILED")

    def test_job_database_constraints_and_scheduling(self):
        document = self.make_document()
        job = Job.objects.create(document=document)
        for values in (
            {"type": "UNKNOWN"},
            {"status": "READY"},
            {"attempts": -1},
        ):
            with self.subTest(values=values), self.assertRaises(IntegrityError):
                with transaction.atomic():
                    Job.objects.filter(pk=job.pk).update(**values)
        job.run_after = document.created_at + timedelta(hours=1)
        job.save(update_fields=["run_after"])
        job.refresh_from_db()
        self.assertEqual(job.run_after, document.created_at + timedelta(hours=1))

    def test_digest_field_validation(self):
        digest = Document._meta.get_field("sha256")
        self.assertEqual(digest.clean("a" * 64, None), "a" * 64)
        for value in ("", "a" * 63, "a" * 65, "g" * 64):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                digest.clean(value, None)

    def test_partial_save_updates_timestamp_and_empty_save_is_noop(self):
        document = self.make_document()
        created_at = document.created_at
        later = created_at + timedelta(seconds=1)
        with patch("apps.documents.models.timezone.now", return_value=later):
            document.status = Document.Status.PROCESSING
            document.save(update_fields=["status"])
        document.refresh_from_db()
        self.assertEqual(document.created_at, created_at)
        self.assertEqual(document.updated_at, later)
        self.assertEqual(document.status, Document.Status.PROCESSING)
        with self.assertNumQueries(0):
            document.save(update_fields=[])
        self.assertEqual(document.updated_at, later)

    def test_course_and_owner_deletion_cascade(self):
        document = self.make_document()
        Job.objects.create(document=document)
        self.course.delete()
        self.assertFalse(Document.objects.exists())
        self.assertFalse(Job.objects.exists())
        self.assertTrue(get_user_model().objects.filter(pk=self.owner.pk).exists())

        self.course = Course.objects.create(owner=self.owner, name="Second course")
        Job.objects.create(document=self.make_document())
        self.owner.delete()
        self.assertFalse(Course.objects.exists())
        self.assertFalse(Document.objects.exists())
        self.assertFalse(Job.objects.exists())

    def test_required_database_indexes(self):
        with connection.cursor() as cursor:
            for model, columns in (
                (Document, ("owner_id", "status", "course_id")),
                (Job, ("document_id", "status")),
            ):
                constraints = connection.introspection.get_constraints(
                    cursor, model._meta.db_table
                )
                for column in columns:
                    with self.subTest(model=model.__name__, column=column):
                        self.assertTrue(
                            any(
                                item["index"] and item["columns"] == [column]
                                for item in constraints.values()
                            )
                        )
