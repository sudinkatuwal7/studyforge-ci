"""Gemini quiz generation using the existing prompt and quiz validator."""

from apps.gemini import GeminiJSONClient
from .base import InvalidLLMOutput, LLMError
from .provider import OpenAIQuizLLM, SYSTEM_PROMPT


class GeminiQuizLLM(OpenAIQuizLLM):
    def __init__(self, client=None):
        self._gemini = GeminiJSONClient("QUIZ_LLM_MODEL", LLMError, InvalidLLMOutput, client=client)
        self.name = self._gemini.name

    def _call(self, text, num_questions):
        return self._gemini.complete([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Write a quiz of exactly {num_questions} questions from the course "
                f"material below.\n\n<material>\n{text}\n</material>"
            )},
        ])
