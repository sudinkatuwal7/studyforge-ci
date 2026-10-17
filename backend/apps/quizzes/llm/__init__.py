"""Pick a generator from the environment, so calling code never
names a provider directly."""

import os

from apps.quizzes.llm.base import (
    ALLOWED_QUESTION_COUNTS,
    InvalidLLMOutput,
    LLMError,
    validate_quiz,
)

__all__ = [
    "ALLOWED_QUESTION_COUNTS",
    "get_client",
    "InvalidLLMOutput",
    "LLMError",
    "validate_quiz",
]


def get_client():
    backend = os.environ.get("QUIZ_LLM_BACKEND", "fake")

    if backend == "fake":
        from apps.quizzes.llm.fake import FakeQuizLLM

        return FakeQuizLLM()

    if backend == "openai":
        from apps.quizzes.llm.provider import OpenAIQuizLLM

        return OpenAIQuizLLM()

    raise LLMError(f"Unknown QUIZ_LLM_BACKEND: {backend!r}")
