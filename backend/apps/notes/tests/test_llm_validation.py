from django.test import SimpleTestCase

from apps.notes.llm.base import InvalidLLMOutput, validate_study_guide

VALID = {
    "key_concepts": ["Normalization - organising tables to remove redundancy."],
    "important_points": ["Third normal form removes transitive dependencies."],
    "summary": "A short paragraph about database normalization.",
}


class ValidateStudyGuideTests(SimpleTestCase):
    """Model output is untrusted input. These pin that contract."""

    def test_valid_payload_passes_through(self):
        self.assertEqual(validate_study_guide(dict(VALID)), VALID)

    def test_extra_keys_are_dropped(self):
        payload = dict(VALID, unexpected="ignore me")
        self.assertNotIn("unexpected", validate_study_guide(payload))

    def test_missing_key_is_rejected(self):
        payload = dict(VALID)
        del payload["summary"]
        with self.assertRaises(InvalidLLMOutput):
            validate_study_guide(payload)

    def test_empty_list_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_study_guide(dict(VALID, key_concepts=[]))

    def test_non_string_items_are_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_study_guide(dict(VALID, important_points=[{"a": "b"}]))

    def test_blank_summary_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_study_guide(dict(VALID, summary="   "))

    def test_non_object_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_study_guide(["not", "an", "object"])