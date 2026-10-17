from django.test import SimpleTestCase

from apps.quizzes.llm.base import InvalidLLMOutput, validate_quiz
from apps.quizzes.llm.fake import FakeQuizLLM

VALID_QUESTION = {
    "text": "Which normal form removes transitive dependencies?",
    "options": ["1NF", "2NF", "3NF", "BCNF"],
    "correct_option_index": 2,
    "explanation": "Third normal form removes transitive dependencies.",
}


def quiz_of(*questions):
    return {"questions": list(questions)}


class ValidateQuizTests(SimpleTestCase):
    """Model output is untrusted input. These pin that contract."""

    def test_valid_payload_passes_through(self):
        payload = quiz_of(*[dict(VALID_QUESTION)] * 5)
        self.assertEqual(validate_quiz(payload, 5), payload)

    def test_extra_keys_are_dropped(self):
        payload = quiz_of(*[dict(VALID_QUESTION, difficulty="hard")] * 5)
        result = validate_quiz(payload, 5)
        self.assertNotIn("difficulty", result["questions"][0])

    def test_whitespace_is_trimmed(self):
        question = dict(VALID_QUESTION, text="  Padded?  ", explanation=" Why. ")
        result = validate_quiz(quiz_of(*[question] * 5), 5)
        self.assertEqual(result["questions"][0]["text"], "Padded?")
        self.assertEqual(result["questions"][0]["explanation"], "Why.")

    def test_wrong_question_count_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_quiz(quiz_of(*[VALID_QUESTION] * 4), 5)

    def test_non_object_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_quiz(["not", "an", "object"], 5)

    def test_missing_questions_list_is_rejected(self):
        with self.assertRaises(InvalidLLMOutput):
            validate_quiz({"quiz": []}, 5)

    def test_bad_questions_are_rejected(self):
        cases = {
            "not an object": "a string",
            "blank text": dict(VALID_QUESTION, text="   "),
            "three options": dict(VALID_QUESTION, options=["A", "B", "C"]),
            "five options": dict(VALID_QUESTION, options=["A", "B", "C", "D", "E"]),
            "blank option": dict(VALID_QUESTION, options=["A", "B", " ", "D"]),
            "non-string option": dict(VALID_QUESTION, options=["A", "B", 3, "D"]),
            "duplicate options": dict(VALID_QUESTION, options=["A", "B", "a ", "D"]),
            "index out of range": dict(VALID_QUESTION, correct_option_index=4),
            "negative index": dict(VALID_QUESTION, correct_option_index=-1),
            "string index": dict(VALID_QUESTION, correct_option_index="2"),
            "boolean index": dict(VALID_QUESTION, correct_option_index=True),
            "missing explanation": {k: v for k, v in VALID_QUESTION.items() if k != "explanation"},
        }
        for name, bad in cases.items():
            with self.subTest(name), self.assertRaises(InvalidLLMOutput):
                validate_quiz(quiz_of(*[VALID_QUESTION] * 4, bad), 5)


class FakeQuizLLMTests(SimpleTestCase):
    def test_returns_the_requested_number_of_valid_questions(self):
        for count in (5, 10):
            with self.subTest(count=count):
                result = FakeQuizLLM().generate("any text", count)
                self.assertEqual(len(result["questions"]), count)
