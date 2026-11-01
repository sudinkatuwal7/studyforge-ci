"""Gemini transport with the existing notes batching and validation pipeline."""

import os

from apps.gemini import GeminiJSONClient
from .base import InvalidLLMOutput, LLMError
from .provider import DEFAULT_NOTES_BATCH_LIMIT, DEFAULT_SINGLE_PASS_LIMIT, OpenAIStudyGuideLLM


class GeminiStudyGuideLLM(OpenAIStudyGuideLLM):
    def __init__(self, client=None):
        self._gemini = GeminiJSONClient(
            "NOTES_LLM_MODEL", LLMError, InvalidLLMOutput, timeout=60_000, client=client,
        )
        self.name = self._gemini.name
        self._single_pass_limit = int(os.environ.get("NOTES_SINGLE_PASS_LIMIT", DEFAULT_SINGLE_PASS_LIMIT))
        self._notes_batch_limit = int(os.environ.get("NOTES_BATCH_CHAR_LIMIT", DEFAULT_NOTES_BATCH_LIMIT))

    def _complete(self, system_prompt, instruction, text, tag):
        return self._gemini.complete([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{instruction}\n\n<{tag}>\n{text}\n</{tag}>"},
        ])
