"""Browser-independent voice fallback API checks."""

from unittest.mock import patch
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
import pytest
from rest_framework.test import APIClient

from apps.conversations.voice import transcribe_audio

URL = "/api/v1/voice/transcriptions/"
pytestmark = pytest.mark.django_db


def recording(data=b"recorded audio", mime="audio/webm"):
    return SimpleUploadedFile("question.webm", data, content_type=mime)


def test_voice_transcription_requires_authentication():
    response = APIClient().post(URL, {"audio": recording()}, format="multipart")
    assert response.status_code == 401


def test_voice_transcription_returns_editable_text(owner_client):
    with patch("apps.conversations.voice.transcribe_audio", return_value="What is gravity?") as transcribe:
        response = owner_client.post(URL, {"audio": recording()}, format="multipart")
    assert response.status_code == 200
    assert response.json() == {"text": "What is gravity?"}
    assert transcribe.call_args.args[1] == "audio/webm"


def test_voice_transcription_rejects_invalid_audio_before_provider(owner_client):
    with patch("apps.conversations.voice.transcribe_audio") as transcribe:
        for audio, status in [(recording(b""), 413), (recording(mime="application/pdf"), 415),
                              (recording(b"a" * (5 * 1024 * 1024 + 1)), 413)]:
            response = owner_client.post(URL, {"audio": audio}, format="multipart")
            assert response.status_code == status
    transcribe.assert_not_called()


def test_voice_transcription_provider_failure_is_safe(owner_client):
    with patch("apps.conversations.voice.transcribe_audio", side_effect=RuntimeError("secret provider detail")):
        response = owner_client.post(URL, {"audio": recording()}, format="multipart")
    assert response.status_code == 503
    assert "secret provider detail" not in str(response.content)


def test_voice_transcription_empty_transcript_is_retryable(owner_client):
    with patch("apps.conversations.voice.transcribe_audio", return_value=""):
        response = owner_client.post(URL, {"audio": recording()}, format="multipart")
    assert response.status_code == 422
    assert "No speech was heard" in response.json()["detail"]


def test_voice_transcription_accepts_safari_mp4(owner_client):
    with patch("apps.conversations.voice.transcribe_audio", return_value="A Safari question") as transcribe:
        response = owner_client.post(URL, {"audio": recording(mime="audio/mp4")}, format="multipart")
    assert response.status_code == 200
    assert transcribe.call_args.args[1] == "audio/m4a"


def test_voice_transcription_uses_gemini_audio_and_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_VOICE_MODEL", "gemini-2.5-flash")
    with patch("apps.conversations.voice.genai.Client") as client:
        client.return_value.models.generate_content.return_value.text = "  Explain gravity  "
        text = transcribe_audio(BytesIO(b"webm bytes"), "audio/webm")
    assert text == "Explain gravity"
    assert client.call_args.kwargs["api_key"] == "test-key"
    call = client.return_value.models.generate_content.call_args
    assert call.kwargs["model"] == "gemini-2.5-flash"
    assert call.kwargs["contents"][0].inline_data.data == b"webm bytes"
    assert call.kwargs["contents"][0].inline_data.mime_type == "audio/webm"
