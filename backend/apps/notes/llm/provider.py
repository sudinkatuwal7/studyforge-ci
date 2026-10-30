"""OpenAI-backed study guide generation."""

import json
import os

from openai import APIError, OpenAI, RateLimitError

from apps.notes.llm.base import (
    InvalidLLMOutput,
    LLMError,
    validate_course_notes,
    validate_study_guide,
)

DEFAULT_MODEL = "gpt-4o-mini"

# Characters, not tokens — roughly 4 characters per token, so this leaves
# generous room for the system prompt and the response. Overridable so the
# staged path can be exercised without a 200-page PDF.
DEFAULT_SINGLE_PASS_LIMIT = 200_000

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


NOTES_SYSTEM_PROMPT = """You write organized study notes from a student's own course
materials. Each material appears under a "## " heading carrying its title. The
materials may come from any subject and any format.

Grounding rules:
- Use ONLY the material text provided. Never add outside knowledge, even where
  it is incomplete, or where you know more about the topic than it does.
- Every item must be traceable to something the materials actually state.
- If the materials are too thin to support many items, return fewer rather than
  padding with generic knowledge about the topic.

Organizing rules:
- Group by topic. Where several materials cover the same topic, consolidate them
  into one section instead of repeating it per material.
- Keep distinct topics in the order the materials present them.

Writing rules:
- Write for a student revising this material for an exam.
- Preserve the materials' own terminology, notation and symbols.
- Reproduce formulas, dates, names, figures and citations exactly as written.
- No meta-commentary. Never write "the document", "this lecture", "the material",
  "the text", "the author", "covers", or "discusses".

Respond with a JSON object in exactly this shape:

{
  "overview": "A short paragraph stating the main ideas across all materials.",
  "sections": [
    {
      "heading": "A short topic heading",
      "key_concepts": [
        {"term": "A term the materials explain",
         "explanation": "One or two sentences, as the materials define it."}
      ],
      "points": ["A specific claim worth remembering that is not already a key
        concept: a rule, relationship, result, condition, exception, or date."]
    }
  ]
}"""


NOTES_SINGLE_INSTRUCTION = "Write study notes from the materials below."
NOTES_MERGE_INSTRUCTION = (
    "Below is a JSON list of partial notes taken from consecutive batches of the "
    "same materials, in order. Consolidate them into one set of notes, merging "
    "duplicate sections and concepts and keeping the most specific wording."
)


def _split_into_sections(text, limit):
    """Split text into chunks under `limit`, cutting on blank lines.

    Cutting mid-sentence would hand the model a fragment it cannot interpret.
    Paragraph boundaries are the cheapest safe place to cut, and because the
    fixture joins pages with blank lines, they usually fall on page breaks.
    """
    sections, current = [], ""

    for paragraph in text.split("\n\n"):
        # A single paragraph longer than the limit has to be cut somewhere.
        while len(paragraph) > limit:
            if current:
                sections.append(current)
                current = ""
            sections.append(paragraph[:limit])
            paragraph = paragraph[limit:]

        if current and len(current) + len(paragraph) + 2 > limit:
            sections.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph

    if current:
        sections.append(current)

    return sections


def _labelled_parts(title, text, limit):
    """One material as blocks under `limit`, each headed by the material's title."""
    # Room for the "## title (part N)" line that goes on each part.
    parts = _split_into_sections(text, max(limit - len(title) - 32, 1))
    if len(parts) == 1:
        return [f"## {title}\n\n{parts[0]}"]
    return [f"## {title} (part {i})\n\n{part}" for i, part in enumerate(parts, start=1)]


def _batch_materials(sources, limit):
    """Group (title, text) materials into labelled batches under `limit`.

    A long material is split first, and every part keeps its title, so the
    model always knows which material it is reading. Small materials share a
    batch, which keeps the number of calls close to total size / limit.
    """
    batches, current = [], ""

    for title, text in sources:
        for block in _labelled_parts(title, text, limit):
            if current and len(current) + len(block) + 2 > limit:
                batches.append(current)
                current = block
            else:
                current = f"{current}\n\n{block}" if current else block

    if current:
        batches.append(current)

    return batches


class OpenAIStudyGuideLLM:
    def __init__(self):
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise LLMError("OPENAI_API_KEY is not set")

        self.name = os.environ.get("NOTES_LLM_MODEL", DEFAULT_MODEL)
        self._single_pass_limit = int(
            os.environ.get("NOTES_SINGLE_PASS_LIMIT", DEFAULT_SINGLE_PASS_LIMIT)
        )
        # A hung request must not hang a worker forever. max_retries handles
        # transient 429s and 5xx without us writing a retry loop.
        self._client = OpenAI(api_key=key, timeout=60.0, max_retries=2)

    def generate(self, text):
        if len(text) <= self._single_pass_limit:
            return self._generate_once(text)
        return self._generate_staged(text)

    def generate_notes(self, sources):
        """Build notes from (title, text) materials, in the order given."""
        batches = _batch_materials(sources, self._single_pass_limit)
        print(f"[llm] notes: {len(batches)} batches", flush=True)

        if len(batches) == 1:
            return self._generate_notes_once(batches[0], NOTES_SINGLE_INSTRUCTION)

        partials = [
            self._generate_notes_once(batch, NOTES_SINGLE_INSTRUCTION)
            for batch in batches
        ]

        combined = json.dumps(partials, ensure_ascii=False)
        if len(combined) > self._single_pass_limit:
            raise LLMError("Partial notes are too large to merge in one call")
        return self._generate_notes_once(combined, NOTES_MERGE_INSTRUCTION)

    def _generate_notes_once(self, text, instruction):
        raw = self._complete(NOTES_SYSTEM_PROMPT, instruction, text, "materials")

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise InvalidLLMOutput(f"Model did not return JSON: {raw[:200]}") from exc

        return validate_course_notes(payload)

    def _generate_staged(self, text):
        """Summarise section by section, then summarise the summaries.

        Sections stay in document order throughout — this is a full-document
        study guide, not a search result, so order carries meaning.
        """
        sections = _split_into_sections(text, self._single_pass_limit)
        print(f"[llm] staged: {len(sections)} sections", flush=True)

        partials = [self._generate_once(section) for section in sections]

        combined = "\n\n".join(
            f"Section {i + 1}\n"
            f"Concepts: {' | '.join(p['key_concepts'])}\n"
            f"Points: {' | '.join(p['important_points'])}\n"
            f"Summary: {p['summary']}"
            for i, p in enumerate(partials)
        )
        return self._generate_once(combined, merging=True)

    def _generate_once(self, text, merging=False):
        raw = self._call(text, merging=merging)

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise InvalidLLMOutput(f"Model did not return JSON: {raw[:200]}") from exc

        return validate_study_guide(payload)

    def _call(self, text, merging=False):
        if merging:
            instruction = (
                "Below are notes taken from consecutive sections of one document, "
                "in order. Consolidate them into a single study guide, merging "
                "duplicates and keeping the most specific wording."
            )
        else:
            instruction = "Build a study guide from the document below."

        return self._complete(SYSTEM_PROMPT, instruction, text, "document")

    def _complete(self, system_prompt, instruction, text, tag):
        try:
            response = self._client.chat.completions.create(
                model=self.name,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"{instruction}\n\n<{tag}>\n{text}\n</{tag}>",
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