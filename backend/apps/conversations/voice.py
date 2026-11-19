"""Authenticated, bounded speech transcription for browsers without recognition."""

import os
import logging

from django.core.exceptions import RequestDataTooBig
import httpx
from google import genai
from google.genai import errors, types
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.documents.views import DocumentAPIView

logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 5 * 1024 * 1024
CONTENT_TYPES = {
    "audio/webm": "audio/webm", "audio/ogg": "audio/ogg",
    # Safari's MP4 audio recording is an M4A-compatible container.
    "audio/mp4": "audio/m4a", "audio/m4a": "audio/m4a",
    "audio/mpeg": "audio/mpeg", "audio/wav": "audio/wav", "audio/x-wav": "audio/wav",
}


def transcribe_audio(audio, mime_type):
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Transcription is not configured")
    client = genai.Client(
        api_key=key, vertexai=False,
        http_options=types.HttpOptions(timeout=30_000, retry_options=types.HttpRetryOptions(attempts=2)),
    )
    response = client.models.generate_content(
        model=os.environ.get("GEMINI_VOICE_MODEL", "gemini-2.5-flash"),
        contents=[
            types.Part.from_bytes(data=audio.read(), mime_type=mime_type),
            types.Part.from_text(text="Transcribe the spoken words exactly as heard. Return only the transcript, without commentary or translation."),
        ],
    )
    return (response.text or "").strip()


class VoiceTranscriptionView(DocumentAPIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        if request.content_type.split(";", 1)[0].lower() != "multipart/form-data":
            return Response({"detail": "Send a multipart audio file."}, status=415)
        try:
            data = request.data
        except RequestDataTooBig:
            return Response({"detail": "The recording is too large."}, status=413)
        if set(data) != {"audio"} or len(request.FILES.getlist("audio")) != 1:
            return Response({"detail": "Upload one audio recording."}, status=400)
        audio = request.FILES["audio"]
        mime = audio.content_type.split(";", 1)[0].lower()
        provider_mime = CONTENT_TYPES.get(mime)
        if not provider_mime:
            return Response({"detail": "This audio format is not supported."}, status=415)
        if not 0 < audio.size <= MAX_AUDIO_BYTES:
            return Response({"detail": "The recording is empty or too large."}, status=413)
        try:
            text = transcribe_audio(audio, provider_mime)
        except (errors.APIError, httpx.HTTPError, RuntimeError, OSError, ValueError) as exc:
            logger.warning("Voice transcription failed: %s (status=%s)", type(exc).__name__, getattr(exc, "code", None))
            return Response({"detail": "Voice transcription is unavailable. Please try again or type your question."}, status=503)
        if not text:
            return Response({"detail": "No speech was heard. Try again or type your question."}, status=422)
        return Response({"text": text})
