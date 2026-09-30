"""Pick a generator from the environment, so calling code never
names a provider directly."""

import os

from apps.notes.llm.base import InvalidLLMOutput, LLMError, validate_study_guide

__all__ = ["get_client", "LLMError", "InvalidLLMOutput", "validate_study_guide"]


def get_client():
    # TODO(SCRUM-68): move to Django settings once the app is registered.
    backend = os.environ.get("NOTES_LLM_BACKEND", "fake")

    if backend == "fake":
        from apps.notes.llm.fake import FakeStudyGuideLLM

        return FakeStudyGuideLLM()

    if backend == "openai":
        from apps.notes.llm.provider import OpenAIStudyGuideLLM

        return OpenAIStudyGuideLLM()

    raise LLMError(f"Unknown NOTES_LLM_BACKEND: {backend!r}")