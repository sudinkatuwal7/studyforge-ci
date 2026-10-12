"""All backend tests are offline at the AI boundary."""

import httpx
import pytest


@pytest.fixture(autouse=True)
def offline_ai(monkeypatch):
    monkeypatch.setenv("NOTES_LLM_BACKEND", "fake")
    for name in ("OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"):
        monkeypatch.delenv(name, raising=False)

    def blocked(*args, **kwargs):
        raise AssertionError("Tests must mock AI/HTTP providers; real HTTP requests are disabled.")

    async def blocked_async(*args, **kwargs):
        blocked()

    # Both current AI SDKs use HTTPX. Keep their behavior mocked above transport.
    monkeypatch.setattr(httpx.Client, "send", blocked)
    monkeypatch.setattr(httpx.AsyncClient, "send", blocked_async)
