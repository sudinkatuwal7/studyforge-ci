"""Shared native Gemini JSON transport; feature modules retain validation."""

import os

import httpx
from google import genai
from google.genai import errors, types

DEFAULT_MODEL = "gemini-flash-latest"


class GeminiJSONClient:
    def __init__(self, model_env, error, invalid, *, timeout=30_000, client=None):
        self.name = os.environ.get(model_env, DEFAULT_MODEL).strip()
        self.error = error
        self.invalid = invalid
        if not self.name:
            raise error(f"{model_env} is not set")
        if client is not None:
            self.client = client
            return
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            raise error("GEMINI_API_KEY is not set")
        self.client = genai.Client(
            api_key=key, vertexai=False,
            http_options=types.HttpOptions(
                timeout=timeout, retry_options=types.HttpRetryOptions(attempts=2),
            ),
        )

    def complete(self, messages, *, schema=None, max_output_tokens=None):
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [
            types.Content(
                role="model" if m["role"] == "assistant" else "user",
                parts=[types.Part.from_text(text=m["content"])],
            )
            for m in messages if m["role"] != "system"
        ]
        # A repair request must end with a user turn, after the rejected answer.
        if contents and contents[-1].role == "model":
            contents.append(types.Content(role="user", parts=[
                types.Part.from_text(text="Return the corrected JSON response.")
            ]))
        try:
            response = self.client.models.generate_content(
                model=self.name, contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system, response_mime_type="application/json",
                    response_json_schema=schema, max_output_tokens=max_output_tokens,
                ),
            )
        except (errors.APIError, httpx.HTTPError):
            raise self.error("Gemini generation is temporarily unavailable. Try again shortly.") from None
        try:
            if not response.candidates or len(response.candidates) != 1:
                raise ValueError("Expected one candidate")
            candidate = response.candidates[0]
            if candidate.finish_reason != types.FinishReason.STOP:
                raise ValueError("Incomplete or blocked response")
            parts = candidate.content.parts
            if not parts or any(p.function_call is not None for p in parts):
                raise ValueError("Unexpected response")
            raw = "".join(p.text for p in parts if p.text and not p.thought)
            if not raw.strip():
                raise ValueError("Empty response")
            return raw
        except (AttributeError, TypeError, ValueError):
            raise self.invalid("Gemini returned an invalid or incomplete response.") from None
