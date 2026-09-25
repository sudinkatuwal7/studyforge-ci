"""OpenAI-backed study guide generation."""

import json
import os

from openai import APIError, OpenAI, RateLimitError

from apps.notes.llm.base import InvalidLLMOutput, LLMError, validate_study_guide

DEFAULT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """You build study guides from a student's own course materials.
The material may come from any subject and any format — lecture slides, prose
readings, problem sets, lab handouts, transcripts.

Grounding rules:
- Use ONLY the document text provided. Never add outside knowledge, even where
  the document is incomplete, or where you know more about the topic than it does.
- Every item must be traceable to something the document actually states.
- If the document is too thin to support a full list, return fewer items rather
  than padding with generic knowledge about the topic.

Writing rules:
- Write for a student revising this material for an exam.
- Preserve the document's own terminology, notation and symbols. Do not swap its
  terms for more common ones, and do not simplify its notation.
- Reproduce formulas, dates, names, figures and citations exactly as written.
- No meta-commentary. Never write "the document", "this lecture", "the material",
  "the text", "the author", "covers", or "discusses".

Respond with a JSON object in exactly this shape:

{
  "key_concepts": [
    "Term — one or two sentences explaining it as this document defines it.
     A term the document explains, never a heading it merely displays.
     Between 3 and 8 items."
  ],
  "important_points": [
    "One specific claim worth remembering that is NOT already covered in
     key_concepts — a rule, relationship, result, cause, condition, exception,
     date, or worked outcome. Between 3 and 8 items."
  ],
  "summary": "One paragraph of 3 to 6 sentences that teaches this material to a
    student who missed the session. State the content itself, not what the
    document is about."
}"""


class OpenAIStudyGuideLLM:
    def __init__(self):
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise LLMError("OPENAI_API_KEY is not set")

        self.name = os.environ.get("NOTES_LLM_MODEL", DEFAULT_MODEL)
        self._client = OpenAI(api_key=key)

    def generate(self, text):
        raw = self._call(text)

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise InvalidLLMOutput(f"Model did not return JSON: {raw[:200]}") from exc

        return validate_study_guide(payload)

    def _call(self, text):
        try:
            response = self._client.chat.completions.create(
                model=self.name,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Build a study guide from the document below.\n\n"
                            f"<document>\n{text}\n</document>"
                        ),
                    },
                ],
            )
        except RateLimitError as exc:
            raise LLMError(
                "Rate limit reached on the shared class key. Try again shortly."
            ) from exc
        except APIError as exc:
            raise LLMError(f"OpenAI call failed: {exc}") from exc

        usage = response.usage
        print(
            f"[llm] {self.name} in={usage.prompt_tokens} out={usage.completion_tokens}",
            flush=True,
        )

        return response.choices[0].message.content