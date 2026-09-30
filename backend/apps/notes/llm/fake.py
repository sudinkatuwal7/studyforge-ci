"""A generator that returns fixed output without calling any API.

The default everywhere except a real run: free, instant, deterministic.
A failing test then means our code broke, not that a model wandered.
"""

from apps.notes.llm.base import validate_study_guide


class FakeStudyGuideLLM:
    name = "fake"

    def generate(self, text):
        return validate_study_guide(
            {
                "key_concepts": ["Fake concept A", "Fake concept B"],
                "important_points": ["Fake point 1", "Fake point 2"],
                "summary": f"Fake summary of {len(text.split())} words of text.",
            }
        )