"""A generator that returns fixed output without calling any API.

The default everywhere except a real run: free, instant, deterministic.
A failing test then means our code broke, not that a model wandered.
"""

from apps.notes.llm.base import validate_course_notes, validate_study_guide


class FakeStudyGuideLLM:
    name = "fake"

    def generate_notes(self, sources):
        return validate_course_notes(
            {
                "overview": f"Fake overview of {len(sources)} materials.",
                "sections": [
                    {
                        "heading": title,
                        "key_concepts": [
                            {"term": "Fake term", "explanation": "Fake explanation."}
                        ],
                        "points": [f"Fake point from {len(text.split())} words."],
                    }
                    for title, text in sources
                ],
            }
        )

    def generate(self, text):
        return validate_study_guide(
            {
                "key_concepts": ["Fake concept A", "Fake concept B"],
                "important_points": ["Fake point 1", "Fake point 2"],
                "summary": f"Fake summary of {len(text.split())} words of text.",
            }
        )