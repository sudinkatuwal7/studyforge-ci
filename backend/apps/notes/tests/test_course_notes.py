import hashlib
import json
import os
from unittest import mock

from django.contrib.auth import get_user_model
from django.http import Http404
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APITestCase

from apps.conversations.models import Conversation
from apps.courses.models import Course
from apps.documents.models import Document
from apps.documents.services import delete_material
from apps.knowledge.models import Chunk
from apps.notes.llm import InvalidLLMOutput, LLMError, validate_course_notes
from apps.notes.llm.provider import (
    NOTES_MERGE_INSTRUCTION,
    NOTES_SINGLE_INSTRUCTION,
    OpenAIStudyGuideLLM,
    _batch_materials,
)
from apps.notes.models import CourseNotes
from apps.notes.services import generate_course_notes

VALID_NOTES = {
    "overview": "Cells and genes.",
    "sections": [
        {
            "heading": "Cell structure",
            "key_concepts": [{"term": "Membrane", "explanation": "Encloses the cell."}],
            "points": ["Cells divide by mitosis."],
        }
    ],
}


def make_user(email="student@example.edu"):
    return get_user_model().objects.create_user(email=email, password="TestPassword123!")


def make_document(owner, course, title, status=Document.Status.READY, text=None):
    document = Document.objects.create(
        owner=owner,
        course=course,
        title=title,
        sha256=hashlib.sha256(title.encode()).hexdigest(),
        file=f"documents/2026/10/{title}.pdf",
        status=status,
        page_count=1,
    )
    if text is not None:
        Chunk.objects.create(owner=owner, document=document, page_number=1, content=text)
    return document


class ValidateCourseNotesTests(SimpleTestCase):
    def test_valid_notes_pass_and_extras_are_dropped(self):
        payload = {
            **VALID_NOTES,
            "unexpected": "ignore me",
            "sections": [{**VALID_NOTES["sections"][0], "extra": "ignore me"}],
        }
        self.assertEqual(validate_course_notes(payload), VALID_NOTES)

    def test_malformed_notes_are_rejected(self):
        section = VALID_NOTES["sections"][0]
        cases = {
            "not an object": [],
            "no sections": {"overview": "x", "sections": []},
            "blank overview": {**VALID_NOTES, "overview": "  "},
            "blank heading": {**VALID_NOTES, "sections": [{**section, "heading": " "}]},
            "concept without explanation": {
                **VALID_NOTES,
                "sections": [{**section, "key_concepts": [{"term": "Membrane"}]}],
            },
            "empty section": {
                **VALID_NOTES,
                "sections": [{**section, "key_concepts": [], "points": []}],
            },
            "no key concepts anywhere": {
                **VALID_NOTES,
                "sections": [{**section, "key_concepts": []}],
            },
        }
        for name, payload in cases.items():
            with self.subTest(name), self.assertRaises(InvalidLLMOutput):
                validate_course_notes(payload)


class BatchMaterialsTests(SimpleTestCase):
    def test_small_materials_share_one_labelled_batch(self):
        batches = _batch_materials([("Cells", "Cell text."), ("Genes", "Gene text.")], 1000)
        self.assertEqual(batches, ["## Cells\n\nCell text.\n\n## Genes\n\nGene text."])

    def test_every_part_of_a_long_material_keeps_its_title_and_the_limit(self):
        long_text = "\n\n".join(f"Paragraph {i} " + "x" * 80 for i in range(20))
        batches = _batch_materials([("Cells", long_text), ("Genes", "Gene text.")], 300)

        self.assertGreater(len(batches), 1)
        self.assertTrue(all(len(batch) <= 300 for batch in batches))
        self.assertTrue(all(batch.startswith("## Cells") or batch.startswith("## Genes") for batch in batches))
        joined = "\n\n".join(batches)
        for i in range(20):
            self.assertIn(f"Paragraph {i} ", joined)
        self.assertIn("## Genes\n\nGene text.", joined)


class ProviderNotesTests(SimpleTestCase):
    def make_provider(self, batch_limit=60_000, single_pass_limit=200_000):
        env = {
            "OPENAI_API_KEY": "test",
            "NOTES_BATCH_CHAR_LIMIT": str(batch_limit),
            "NOTES_SINGLE_PASS_LIMIT": str(single_pass_limit),
        }
        with mock.patch.dict(os.environ, env), mock.patch("apps.notes.llm.provider.OpenAI"):
            return OpenAIStudyGuideLLM()

    def test_input_under_the_limit_is_one_call(self):
        provider = self.make_provider(1000)
        with mock.patch.object(provider, "_generate_notes_once", return_value=VALID_NOTES) as once:
            result = provider.generate_notes([("Cells", "Cell text."), ("Genes", "Gene text.")])
        self.assertEqual(once.call_count, 1)
        self.assertEqual(result, VALID_NOTES)

    def test_input_over_the_limit_is_summarised_then_merged(self):
        provider = self.make_provider(450)
        with mock.patch.object(provider, "_generate_notes_once", return_value=VALID_NOTES) as once:
            provider.generate_notes([("Cells", "a" * 300), ("Genes", "b" * 300)])

        self.assertEqual(once.call_count, 3)
        first_batch, second_batch, merge = once.call_args_list
        self.assertTrue(first_batch.args[0].startswith("## Cells"))
        self.assertTrue(second_batch.args[0].startswith("## Genes"))
        self.assertIn("Membrane", merge.args[0])
        self.assertEqual(merge.args[1], NOTES_MERGE_INSTRUCTION)

    def test_batches_use_the_notes_limit_not_the_study_guide_limit(self):
        provider = self.make_provider(batch_limit=100, single_pass_limit=10_000)
        with mock.patch.object(provider, "_generate_notes_once", return_value=VALID_NOTES) as once:
            provider.generate_notes([("Cells", "a" * 50), ("Genes", "b" * 50)])
        self.assertEqual(once.call_count, 3)

    def test_partial_notes_too_large_to_merge_fail_rather_than_overflow(self):
        provider = self.make_provider(batch_limit=100, single_pass_limit=100)
        with mock.patch.object(provider, "_generate_notes_once", return_value=VALID_NOTES):
            with self.assertRaises(LLMError):
                provider.generate_notes([("Cells", "a" * 80), ("Genes", "b" * 80)])

    def test_one_bad_item_is_retried_instead_of_failing_the_run(self):
        """The real failure: one invalid point rejected a finished 5-call run."""
        bad = {**VALID_NOTES, "sections": [{**VALID_NOTES["sections"][0], "points": [{"text": "x"}]}]}
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", side_effect=[json.dumps(bad), json.dumps(VALID_NOTES)]) as call:
            result = provider._generate_notes_once("Cell text.", NOTES_MERGE_INSTRUCTION)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(result, VALID_NOTES)

    def test_output_that_stays_invalid_fails_after_one_retry(self):
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", return_value="not json") as call:
            with self.assertRaises(InvalidLLMOutput):
                provider._generate_notes_once("Cell text.", NOTES_SINGLE_INSTRUCTION)
        self.assertEqual(call.call_count, 2)

    def test_provider_failure_is_not_repeated(self):
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", side_effect=LLMError("down")) as call:
            with self.assertRaises(LLMError):
                provider._generate_notes_once("Cell text.", NOTES_SINGLE_INSTRUCTION)
        self.assertEqual(call.call_count, 1)

    def test_valid_but_thin_notes_are_retried(self):
        """The real failure: 180,000 characters produced valid notes of about 1%."""
        full = json.dumps({**VALID_NOTES, "overview": "x" * 5_000})
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", side_effect=[json.dumps(VALID_NOTES), full]) as call:
            result = provider._generate_notes_once("a" * 100_000, NOTES_SINGLE_INSTRUCTION)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(len(result["overview"]), 5_000)

    def test_notes_that_stay_thin_fail_instead_of_looking_complete(self):
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", return_value=json.dumps(VALID_NOTES)) as call:
            with self.assertRaises(InvalidLLMOutput):
                provider._generate_notes_once("a" * 100_000, NOTES_SINGLE_INSTRUCTION)
        self.assertEqual(call.call_count, 2)

    def test_a_merge_that_drops_most_of_its_input_is_rejected(self):
        partial = json.dumps({**VALID_NOTES, "overview": "x" * 15_000})
        thin_merge = json.dumps({**VALID_NOTES, "overview": "x" * 2_000})
        provider = self.make_provider(batch_limit=100)
        with mock.patch.object(provider, "_complete", side_effect=[partial, partial, thin_merge, thin_merge]) as call:
            with self.assertRaises(InvalidLLMOutput):
                provider.generate_notes([("Cells", "a" * 50), ("Genes", "b" * 50)])
        self.assertEqual(call.call_count, 4)

    def test_short_input_may_produce_short_notes(self):
        provider = self.make_provider()
        with mock.patch.object(provider, "_complete", return_value=json.dumps(VALID_NOTES)) as call:
            provider._generate_notes_once("a" * 19_999, NOTES_SINGLE_INSTRUCTION)
        self.assertEqual(call.call_count, 1)


class GenerateCourseNotesTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.course = Course.objects.create(owner=self.user, name="Biology")
        self.first = make_document(self.user, self.course, "Cells", text="Cell text.")
        self.second = make_document(self.user, self.course, "Genes", text="Gene text.")

    def test_every_selected_material_reaches_the_model_in_upload_order(self):
        client = mock.Mock()
        client.name = "mock"
        client.generate_notes.return_value = VALID_NOTES

        notes = generate_course_notes(self.user, self.course, [self.second, self.first], client=client)

        client.generate_notes.assert_called_once_with([("Cells", "Cell text."), ("Genes", "Gene text.")])
        self.assertEqual(notes.title, "Notes: Cells, Genes")
        self.assertEqual(notes.sections, VALID_NOTES["sections"])
        self.assertEqual(notes.model_name, "mock")
        self.assertCountEqual(notes.source_documents.all(), [self.first, self.second])

    def test_model_failure_saves_nothing(self):
        client = mock.Mock()
        client.generate_notes.side_effect = LLMError("down")
        with self.assertRaises(LLMError):
            generate_course_notes(self.user, self.course, [self.first], client=client)
        self.assertFalse(CourseNotes.objects.exists())

    def test_material_deleted_during_generation_is_not_saved(self):
        client = mock.Mock()
        client.name = "mock"

        def delete_mid_call(sources):
            self.second.delete()
            return VALID_NOTES

        client.generate_notes.side_effect = delete_mid_call
        with self.assertRaises(Http404):
            generate_course_notes(self.user, self.course, [self.first, self.second], client=client)
        self.assertFalse(CourseNotes.objects.exists())


class CourseNotesEndpointTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(user=self.user)
        self.course = Course.objects.create(owner=self.user, name="Biology")
        self.first = make_document(self.user, self.course, "Cells", text="Cell text.")
        self.second = make_document(self.user, self.course, "Genes", text="Gene text.")
        self.url = f"/api/v1/courses/{self.course.pk}/notes/"

    def post(self, document_ids, url=None):
        return self.client.post(url or self.url, {"document_ids": document_ids}, format="json")

    def test_generates_headed_notes_from_multiple_materials(self):
        response = self.post([self.first.pk, self.second.pk])

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["title"], "Notes: Cells, Genes")
        self.assertEqual([s["heading"] for s in body["sections"]], ["Cells", "Genes"])
        self.assertEqual(body["sections"][0]["key_concepts"][0]["term"], "Fake term")
        self.assertEqual(
            body["source_documents"],
            [{"id": self.first.pk, "name": "Cells"}, {"id": self.second.pk, "name": "Genes"}],
        )

    def test_one_material_is_a_valid_selection(self):
        self.assertEqual(self.post([self.first.pk]).status_code, 201)

    def test_invalid_selections_are_rejected(self):
        for document_ids in ([], [self.first.pk, self.first.pk], list(range(1, 22)), ["x"]):
            with self.subTest(document_ids=document_ids):
                self.assertEqual(self.post(document_ids).status_code, 400)

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.post([self.first.pk]).status_code, (401, 403))

    def test_unauthorized_materials_return_404_and_save_nothing(self):
        other_user = make_user("someone-else@example.edu")
        other_course = Course.objects.create(owner=other_user, name="Secret")
        theirs = make_document(other_user, other_course, "Theirs", text="Private.")
        my_other_course = Course.objects.create(owner=self.user, name="Chemistry")
        elsewhere = make_document(self.user, my_other_course, "Elsewhere", text="Other course.")
        conversation = Conversation.objects.create(owner=self.user, course=self.course)
        chat_upload = Document.objects.create(
            owner=self.user,
            conversation=conversation,
            title="Chat upload",
            sha256="c" * 64,
            file="documents/2026/10/chat.pdf",
            status=Document.Status.READY,
        )

        for name, document in {
            "another student": theirs,
            "another course": elsewhere,
            "chat upload": chat_upload,
        }.items():
            with self.subTest(name):
                self.assertEqual(self.post([self.first.pk, document.pk]).status_code, 404)

        foreign_course = f"/api/v1/courses/{other_course.pk}/notes/"
        self.assertEqual(self.post([theirs.pk], url=foreign_course).status_code, 404)
        self.assertFalse(CourseNotes.objects.exists())

    def test_material_not_ready_returns_409_with_its_id(self):
        pending = make_document(self.user, self.course, "Pending", status=Document.Status.PROCESSING)

        response = self.post([self.first.pk, pending.pk])

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_NOT_READY")
        self.assertEqual(response.json()["document_ids"], [pending.pk])

    def test_material_without_text_returns_409_before_calling_the_model(self):
        empty = make_document(self.user, self.course, "Scanned")

        with mock.patch("apps.notes.services.get_client") as get_client:
            response = self.post([self.first.pk, empty.pk])

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_HAS_NO_TEXT")
        self.assertEqual(response.json()["document_ids"], [empty.pk])
        get_client.assert_not_called()

    def test_input_over_the_total_limit_returns_422_before_calling_the_model(self):
        with mock.patch.dict(os.environ, {"NOTES_TOTAL_CHAR_LIMIT": "5"}):
            with mock.patch("apps.notes.services.get_client") as get_client:
                response = self.post([self.first.pk])

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "NOTES_INPUT_TOO_LARGE")
        get_client.assert_not_called()

    def test_model_failure_returns_503_and_saves_nothing(self):
        with mock.patch("apps.notes.services.get_client") as get_client:
            get_client.return_value.generate_notes.side_effect = LLMError("down")
            with self.assertLogs("apps.notes.views", level="ERROR"):
                response = self.post([self.first.pk])

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "NOTES_GENERATION_FAILED")
        self.assertFalse(CourseNotes.objects.exists())

    def test_saved_notes_can_be_read_back_only_by_their_owner(self):
        notes_id = self.post([self.first.pk]).json()["id"]
        url = f"/api/v1/notes/{notes_id}/"

        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], notes_id)

        self.client.force_authenticate(user=make_user("someone-else@example.edu"))
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_deleting_a_source_material_deletes_only_notes_built_from_it(self):
        combined = self.post([self.first.pk, self.second.pk]).json()["id"]
        unrelated = self.post([self.second.pk]).json()["id"]

        delete_material(self.first.pk, self.user)

        self.assertFalse(CourseNotes.objects.filter(pk=combined).exists())
        self.assertTrue(CourseNotes.objects.filter(pk=unrelated).exists())

    def test_deleting_the_course_deletes_its_notes(self):
        self.post([self.first.pk, self.second.pk])

        self.course.delete()

        self.assertFalse(CourseNotes.objects.exists())

    def test_renaming_a_material_keeps_the_notes(self):
        notes_id = self.post([self.first.pk]).json()["id"]

        self.first.title = "Renamed"
        self.first.save(update_fields=["title"])

        response = self.client.get(f"/api/v1/notes/{notes_id}/")
        self.assertEqual(response.json()["source_documents"][0]["name"], "Renamed")
