"""The notes library API: list, read, edit and delete saved notes (SCRUM-91)."""

import copy
import hashlib

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient, APITestCase

from apps.courses.models import Course
from apps.documents.models import Document
from apps.notes.models import CourseNotes, NoteSource

SECTIONS = [
    {
        "heading": "Cell structure",
        "key_concepts": [{"term": "Membrane", "explanation": "Encloses the cell."}],
        "points": ["Cells divide by mitosis."],
    }
]


def make_user(email="student@example.edu"):
    return get_user_model().objects.create_user(email=email, password="TestPassword123!")


def make_document(owner, course, title):
    return Document.objects.create(
        owner=owner,
        course=course,
        title=title,
        sha256=hashlib.sha256(f"{owner.pk}:{title}".encode()).hexdigest(),
        file=f"documents/2026/11/{title}.pdf",
        status=Document.Status.READY,
        page_count=1,
    )


def make_notes(owner, course, title="Notes: Cells", note_type="outline", documents=()):
    notes = CourseNotes.objects.create(
        owner=owner,
        course=course,
        title=title,
        overview="Cells and genes.",
        sections=copy.deepcopy(SECTIONS),
        note_type=note_type,
    )
    for position, document in enumerate(documents):
        NoteSource.objects.create(notes=notes, document_id=document.pk, position=position)
    return notes


def detail_url(notes_or_id):
    notes_id = getattr(notes_or_id, "pk", notes_or_id)
    return f"/api/v1/notes/{notes_id}/"


LIBRARY_URL = "/api/v1/notes/"


class NotesLibraryTestCase(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)
        self.biology = Course.objects.create(owner=self.user, name="Biology")
        self.chemistry = Course.objects.create(owner=self.user, name="Chemistry")
        self.cells = make_document(self.user, self.biology, "Cells")
        self.notes = make_notes(self.user, self.biology, documents=[self.cells])

        self.other_user = make_user("someone-else@example.edu")
        self.other_course = Course.objects.create(owner=self.other_user, name="Secret")
        self.their_notes = make_notes(self.other_user, self.other_course, title="Their notes")

    def assert_unchanged(self, notes, title="Notes: Cells"):
        notes.refresh_from_db()
        self.assertEqual(notes.title, title)
        self.assertEqual(notes.overview, "Cells and genes.")
        self.assertEqual(notes.sections, SECTIONS)


class ListNotesTests(NotesLibraryTestCase):
    def test_lists_only_the_students_notes_newest_first(self):
        chemistry_notes = make_notes(self.user, self.chemistry, title="Notes: Bonds")

        response = self.client.get(LIBRARY_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.json()], [chemistry_notes.pk, self.notes.pk])

    def test_each_row_has_title_course_and_dates_but_no_content(self):
        row = self.client.get(LIBRARY_URL).json()[0]

        self.assertEqual(row["title"], "Notes: Cells")
        self.assertEqual(row["course"], self.biology.pk)
        self.assertEqual(row["course_name"], "Biology")
        self.assertEqual(row["options"], {"note_type": "outline", "detail_level": "standard", "format": "bullets"})
        self.assertIn("created_at", row)
        self.assertIn("updated_at", row)
        self.assertNotIn("overview", row)
        self.assertNotIn("sections", row)

    def test_filters_by_course(self):
        chemistry_notes = make_notes(self.user, self.chemistry, title="Notes: Bonds")

        for course, expected in ((self.biology, [self.notes.pk]), (self.chemistry, [chemistry_notes.pk])):
            with self.subTest(course=course.name):
                response = self.client.get(LIBRARY_URL, {"course": course.pk})
                self.assertEqual(response.status_code, 200)
                self.assertEqual([row["id"] for row in response.json()], expected)

    def test_another_students_course_matches_nothing(self):
        response = self.client.get(LIBRARY_URL, {"course": self.other_course.pk})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_a_student_with_no_notes_gets_an_empty_list(self):
        self.client.force_authenticate(user=make_user("new@example.edu"))
        self.assertEqual(self.client.get(LIBRARY_URL).json(), [])

    def test_invalid_course_filter_is_rejected(self):
        for value in ("abc", "0", "-1", str(2**63)):
            with self.subTest(value=value):
                self.assertEqual(self.client.get(LIBRARY_URL, {"course": value}).status_code, 400)

    def test_query_count_does_not_grow_with_the_number_of_notes(self):
        with CaptureQueriesContext(connection) as one_note:
            self.client.get(LIBRARY_URL)
        for index in range(3):
            make_notes(self.user, self.chemistry, title=f"Notes {index}")
        with CaptureQueriesContext(connection) as four_notes:
            response = self.client.get(LIBRARY_URL)

        self.assertEqual(len(response.json()), 4)
        self.assertEqual(len(four_notes), len(one_note))


class GetNotesTests(NotesLibraryTestCase):
    def test_opening_notes_returns_their_full_content(self):
        response = self.client.get(detail_url(self.notes))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["title"], "Notes: Cells")
        self.assertEqual(body["overview"], "Cells and genes.")
        self.assertEqual(body["sections"], SECTIONS)
        self.assertEqual(body["source_documents"], [{"id": self.cells.pk, "name": "Cells"}])
        self.assertIn("updated_at", body)

    def test_another_students_or_missing_notes_are_not_found(self):
        missing = CourseNotes.objects.order_by("-pk").first().pk + 1000
        for name, notes_id in {
            "another student": self.their_notes.pk,
            "missing": missing,
            "out of range": 2**63,
        }.items():
            with self.subTest(name):
                self.assertEqual(self.client.get(detail_url(notes_id)).status_code, 404)


class UpdateNotesTests(NotesLibraryTestCase):
    def patch(self, data, notes=None):
        return self.client.patch(detail_url(notes or self.notes), data, format="json")

    def test_edited_title_and_content_are_saved(self):
        sections = [
            {
                "heading": "Mitosis",
                "key_concepts": [{"term": "Spindle", "explanation": "Pulls chromosomes apart."}],
                "points": ["Prophase comes first.", "Telophase comes last."],
            }
        ]
        before = self.notes.updated_at

        response = self.patch({"title": "My cell notes", "overview": "Cell division.", "sections": sections})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "My cell notes")
        # A fresh read, as after a refresh, shows the edit.
        body = self.client.get(detail_url(self.notes)).json()
        self.assertEqual(body["title"], "My cell notes")
        self.assertEqual(body["overview"], "Cell division.")
        self.assertEqual(body["sections"], sections)
        self.notes.refresh_from_db()
        self.assertGreater(self.notes.updated_at, before)

    def test_a_field_left_out_keeps_its_saved_value(self):
        self.assertEqual(self.patch({"title": "Renamed"}).status_code, 200)
        self.assert_unchanged(self.notes, title="Renamed")

        self.assertEqual(self.patch({"overview": "New overview."}).status_code, 200)
        self.notes.refresh_from_db()
        self.assertEqual(self.notes.overview, "New overview.")
        self.assertEqual(self.notes.sections, SECTIONS)

    def test_edited_content_is_cleaned_like_generated_content(self):
        sections = [{**SECTIONS[0], "heading": "  Cell structure  ", "extra": "dropped"}]

        response = self.patch({"overview": "  Cells and genes.  ", "sections": sections, "title": "  Trimmed  "})

        self.assertEqual(response.status_code, 200)
        self.assert_unchanged(self.notes, title="Trimmed")

    def test_content_that_fails_structure_validation_is_rejected_and_nothing_is_saved(self):
        section = SECTIONS[0]
        cases = {
            "blank overview": {"overview": "   "},
            "overview not text": {"overview": 123},
            "no sections": {"sections": []},
            "sections not a list": {"sections": "Cells"},
            "section not an object": {"sections": ["Cells"]},
            "blank heading": {"sections": [{**section, "heading": " "}]},
            "concept without explanation": {"sections": [{**section, "key_concepts": [{"term": "Membrane"}]}]},
            "point not text": {"sections": [{**section, "points": [{"text": "x"}]}]},
            "empty section": {"sections": [{**section, "key_concepts": [], "points": []}]},
            # Rules for the outline note type, as for generated outlines.
            "outline section without points": {
                "sections": [section, {**section, "heading": "Genes", "points": []}],
            },
            "outline without key concepts": {"sections": [{**section, "key_concepts": []}]},
        }
        for name, data in cases.items():
            with self.subTest(name):
                response = self.patch({"title": "Should not be saved", **data})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "NOTES_INVALID_CONTENT")
                self.assert_unchanged(self.notes)

    def test_each_note_type_keeps_its_own_structure_rules(self):
        points_only = [{"heading": "Big picture", "points": ["Cells make up living things."]}]
        summary = make_notes(self.user, self.biology, note_type="summary")
        glossary = make_notes(self.user, self.biology, note_type="key_concepts")

        self.assertEqual(self.patch({"sections": points_only}, notes=summary).status_code, 200)
        response = self.patch({"sections": points_only}, notes=glossary)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "NOTES_INVALID_CONTENT")

    def test_invalid_titles_are_rejected_and_nothing_is_saved(self):
        for title in ("", "   ", "x" * 256, 123, None, "Line\nbreak"):
            with self.subTest(title=title):
                response = self.patch({"title": title, "overview": "Should not be saved."})
                self.assertEqual(response.status_code, 400)
                self.assertIn("title", response.json())
                self.assert_unchanged(self.notes)

    def test_owner_course_options_and_sources_cannot_be_changed(self):
        other_document = make_document(self.other_user, self.other_course, "Theirs")

        response = self.patch({
            "owner": self.other_user.pk,
            "course": self.chemistry.pk,
            "note_type": "summary",
            "options": {"note_type": "summary", "detail_level": "brief", "format": "paragraphs"},
            "source_documents": [{"id": other_document.pk, "name": "Theirs"}],
            "document_ids": [other_document.pk],
            "created_at": "2020-01-01T00:00:00Z",
        })

        self.assertEqual(response.status_code, 200)
        created_at = self.notes.created_at
        self.notes.refresh_from_db()
        self.assertEqual(self.notes.owner, self.user)
        self.assertEqual(self.notes.course, self.biology)
        self.assertEqual(self.notes.note_type, "outline")
        self.assertEqual(self.notes.created_at, created_at)
        self.assertEqual(list(self.notes.sources.values_list("document_id", flat=True)), [self.cells.pk])

    def test_another_students_notes_cannot_be_edited(self):
        response = self.patch({"title": "Taken over", "overview": "Mine now."}, notes=self.their_notes)

        self.assertEqual(response.status_code, 404)
        self.assert_unchanged(self.their_notes, title="Their notes")

    def test_put_is_not_allowed(self):
        response = self.client.put(
            detail_url(self.notes), {"title": "Replaced", "overview": "x", "sections": SECTIONS}, format="json"
        )

        self.assertEqual(response.status_code, 405)
        self.assert_unchanged(self.notes)


class DeleteNotesTests(NotesLibraryTestCase):
    def test_deleted_notes_leave_the_library(self):
        kept = make_notes(self.user, self.biology, title="Keep me")

        response = self.client.delete(detail_url(self.notes))

        self.assertEqual(response.status_code, 204)
        self.assertEqual([row["id"] for row in self.client.get(LIBRARY_URL).json()], [kept.pk])
        self.assertEqual(self.client.get(detail_url(self.notes)).status_code, 404)
        self.assertFalse(NoteSource.objects.filter(notes_id=self.notes.pk).exists())

    def test_deleting_notes_keeps_their_source_materials(self):
        self.client.delete(detail_url(self.notes))

        self.assertTrue(Document.objects.filter(pk=self.cells.pk).exists())

    def test_another_students_notes_cannot_be_deleted(self):
        response = self.client.delete(detail_url(self.their_notes))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(CourseNotes.objects.filter(pk=self.their_notes.pk).exists())

    def test_deleting_missing_notes_is_not_found(self):
        self.client.delete(detail_url(self.notes))
        self.assertEqual(self.client.delete(detail_url(self.notes)).status_code, 404)


class SignedOutTests(NotesLibraryTestCase):
    def test_every_endpoint_requires_a_login(self):
        client = APIClient()
        requests = {
            "list": lambda: client.get(LIBRARY_URL),
            "get": lambda: client.get(detail_url(self.notes)),
            "update": lambda: client.patch(detail_url(self.notes), {"title": "Anonymous"}, format="json"),
            "delete": lambda: client.delete(detail_url(self.notes)),
        }
        for name, send in requests.items():
            with self.subTest(name):
                self.assertEqual(send().status_code, 401)
        self.assert_unchanged(self.notes)
