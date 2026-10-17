"""OpenAI-backed quiz generation."""

import json
import os

from openai import APIError, OpenAI, RateLimitError

from apps.quizzes.llm.base import OPTION_COUNT, InvalidLLMOutput, LLMError, validate_quiz

DEFAULT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = f"""You write multiple-choice practice quizzes from a student's own
course materials. The material may come from any subject and any format —
lecture slides, prose readings, problem sets, lab handouts, transcripts.

Grounding rules:
- Use ONLY the material provided. Never add outside knowledge, even where the
  material is incomplete, or where you know more about the topic than it does.
- Every question, correct answer and explanation must be traceable to something
  the material actually states.

Question rules:
- Spread questions across the whole material and across every document given,
  not just the first pages.
- Test understanding of concepts, rules, relationships and results — not trivia
  such as page numbers, headings, or the order topics appear in.
- Each question has exactly {OPTION_COUNT} options and exactly one correct answer.
- Wrong options must be plausible to a student who has not studied, but clearly
  wrong according to the material. No "all of the above" or "none of the above".
- Preserve the material's own terminology, notation and symbols.
- No meta-commentary. Never write "the document", "the lecture", "the material",
  "the text", or "according to".
- The explanation says why the correct answer is right, in one or two sentences,
  using the material's content.

Respond with a JSON object in exactly this shape:

{{
  "questions": [
    {{
      "text": "The question.",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correct_option_index": 0,
      "explanation": "Why the correct option is right."
    }}
  ]
}}

correct_option_index is the zero-based position of the correct option."""


class OpenAIQuizLLM:
    def __init__(self):
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise LLMError("OPENAI_API_KEY is not set")

        self.name = os.environ.get("QUIZ_LLM_MODEL", DEFAULT_MODEL)
        # Quizzes have a 15-second target (SCRUM-27), so fail faster than the
        # study guide does. max_retries handles transient 429s and 5xx.
        self._client = OpenAI(api_key=key, timeout=30.0, max_retries=1)

    def generate(self, text, num_questions):
        raw = self._call(text, num_questions)

        try:
            payload = json.loads(raw)
        except (TypeError, json.JSONDecodeError) as exc:
            raise InvalidLLMOutput(f"Model did not return JSON: {str(raw)[:200]}") from exc

        return validate_quiz(payload, num_questions)

    def _call(self, text, num_questions):
        instruction = (
            f"Write a quiz of exactly {num_questions} questions from the course "
            "material below."
        )

        try:
            response = self._client.chat.completions.create(
                model=self.name,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"{instruction}\n\n<material>\n{text}\n</material>",
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
