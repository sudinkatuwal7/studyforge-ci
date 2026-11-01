"""Offline native Gemini contract tests, using real SDK response objects."""
import copy
import json
import os
from unittest import TestCase
from unittest.mock import Mock, patch

import httpx
from google.genai import errors, types

from apps.knowledge.llm import GeminiRAGLLM, InvalidLLMOutput, RAGProviderError
from apps.knowledge.tests.test_llm import ANSWER, PASSAGES
from apps.notes.llm.gemini import GeminiStudyGuideLLM
from apps.notes.tests.test_llm_validation import VALID
from apps.quizzes.llm.gemini import GeminiQuizLLM
from apps.quizzes.llm.base import InvalidLLMOutput as InvalidQuiz


def response(payload=None, raw=None, reason="STOP"):
    return types.GenerateContentResponse(candidates=[types.Candidate(
        finish_reason=reason,
        content=types.Content(parts=[types.Part(text=raw if raw is not None else json.dumps(payload))]),
    )])


class GeminiTests(TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.sdk = Mock()

    def test_factories_use_gemini_key_and_native_client(self):
        from apps.notes.llm import get_client as notes
        from apps.quizzes.llm import get_client as quizzes
        from apps.knowledge.llm import get_client as rag
        with patch.dict(os.environ, {
            "GEMINI_API_KEY": "test-key", "NOTES_LLM_BACKEND": "gemini",
            "QUIZ_LLM_BACKEND": "gemini", "RAG_LLM_BACKEND": "gemini",
        }), patch("apps.gemini.genai.Client") as client:
            for factory, expected in [(notes, GeminiStudyGuideLLM), (quizzes, GeminiQuizLLM), (rag, GeminiRAGLLM)]:
                self.assertIsInstance(factory(), expected)
                self.assertEqual(client.call_args.kwargs["api_key"], "test-key")
                self.assertFalse(client.call_args.kwargs["vertexai"])
                self.assertGreater(client.call_args.kwargs["http_options"].timeout, 0)

    def test_missing_key_and_blank_model_rejected(self):
        for cls in (GeminiStudyGuideLLM, GeminiQuizLLM, GeminiRAGLLM):
            with self.subTest(cls=cls), self.assertRaisesRegex(Exception, "GEMINI_API_KEY"):
                cls()
        with patch.dict(os.environ, {"RAG_LLM_MODEL": " "}), self.assertRaises(RAGProviderError):
            GeminiRAGLLM(self.sdk)

    def test_study_guide_and_staged_generation(self):
        self.sdk.models.generate_content.return_value = response(VALID)
        llm = GeminiStudyGuideLLM(self.sdk)
        self.assertEqual(llm.generate("material"), VALID)
        llm._single_pass_limit = 50
        self.assertEqual(llm.generate("paragraph one.\n\n" * 10), VALID)
        self.assertGreater(self.sdk.models.generate_content.call_count, 2)

    def test_course_notes_and_retry(self):
        notes = {"overview": "Paging", "sections": [{"heading": "Memory",
                 "key_concepts": [{"term": "Page", "explanation": "A unit of memory."}],
                 "points": ["Pages live in memory."]}]}
        self.sdk.models.generate_content.side_effect = [response(raw="bad JSON"), response(notes)]
        llm = GeminiStudyGuideLLM(self.sdk)
        self.assertEqual(llm.generate_notes([("Lecture", "Pages live in memory.")]), notes)
        self.assertEqual(self.sdk.models.generate_content.call_count, 2)

    def test_quiz_validation(self):
        question = {"text": "Where?", "options": ["RAM", "Disk", "CPU", "GPU"],
                    "correct_option_index": 0, "explanation": "In RAM."}
        self.sdk.models.generate_content.return_value = response({"questions": [question]})
        llm = GeminiQuizLLM(self.sdk)
        self.assertEqual(llm.generate("RAM", 1), {"questions": [question]})
        with self.assertRaises(InvalidQuiz):
            llm.generate("RAM", 2)

    def test_rag_grounding_and_repair(self):
        bad = copy.deepcopy(ANSWER)
        bad["citations"][0]["excerpt"] = "invented quote"
        self.sdk.models.generate_content.side_effect = [response(bad), response(ANSWER)]
        self.assertEqual(GeminiRAGLLM(self.sdk).generate("Explain paging", PASSAGES), ANSWER)
        request = self.sdk.models.generate_content.call_args.kwargs
        self.assertIn("previous response was rejected", request["config"].system_instruction)
        self.assertEqual([c.role for c in request["contents"]], ["user", "model", "user"])
        self.assertIsNotNone(request["config"].response_json_schema)
        self.assertNotIn("score", json.loads(request["contents"][0].parts[0].text)["passages"][0])
        self.sdk.models.generate_content.side_effect = [response(bad), response(bad)]
        with self.assertRaises(InvalidLLMOutput):
            GeminiRAGLLM(self.sdk).generate("Explain paging", PASSAGES)

    def test_rag_no_evidence_never_calls_sdk(self):
        self.assertEqual(GeminiRAGLLM(self.sdk).generate("Question", [])["status"], "INSUFFICIENT_CONTEXT")
        self.sdk.models.generate_content.assert_not_called()

    def test_invalid_responses_rejected(self):
        for result in (response(raw="no JSON"), response(raw='{"status":1,"status":2}'),
                       response(ANSWER, reason="MAX_TOKENS"), response(ANSWER, reason="SAFETY"),
                       response(raw=""), types.GenerateContentResponse()):
            with self.subTest(result=result):
                self.sdk.models.generate_content.return_value = result
                with self.assertRaises(InvalidLLMOutput):
                    GeminiRAGLLM(self.sdk).generate("Question", PASSAGES)

    def test_api_and_transport_errors_are_sanitized(self):
        for error in (errors.ClientError(429, {"error": {"message": "SECRET"}}),
                      errors.ServerError(503, {"error": {"message": "SECRET"}}),
                      httpx.ReadTimeout("SECRET")):
            self.sdk.models.generate_content.side_effect = error
            with self.assertRaises(RAGProviderError) as caught:
                GeminiRAGLLM(self.sdk).generate("Question", PASSAGES)
            self.assertNotIn("SECRET", str(caught.exception))
