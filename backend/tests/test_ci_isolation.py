"""Regression checks for the offline AI boundary used by every backend test."""

import asyncio
import os

import httpx
import pytest

from apps.notes.llm import get_client
from apps.quizzes.llm import get_client as get_quiz_client


def test_notes_provider_is_fake_and_has_no_inherited_api_keys():
    assert os.environ["NOTES_LLM_BACKEND"] == "fake"
    assert get_client().name == "fake"
    for key in ("OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        assert key not in os.environ


def test_quiz_provider_is_fake():
    assert os.environ["QUIZ_LLM_BACKEND"] == "fake"
    assert get_quiz_client().name == "fake"


def test_sync_provider_http_is_blocked_before_network_access():
    with pytest.raises(AssertionError, match="real HTTP requests are disabled"):
        httpx.get("https://example.invalid/paid-provider")


def test_async_provider_http_is_blocked_before_network_access():
    async def request():
        async with httpx.AsyncClient() as client:
            await client.get("https://example.invalid/paid-provider")

    with pytest.raises(AssertionError, match="real HTTP requests are disabled"):
        asyncio.run(request())
