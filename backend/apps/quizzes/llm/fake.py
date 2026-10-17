"""A generator that returns fixed output without calling any API.

The default everywhere except a real run: free, instant, deterministic.
A failing test then means our code broke, not that a model wandered.

The right answer is always first and literally named "Correct N", so tests
can check that shuffling kept it correct.
"""

from apps.quizzes.llm.base import validate_quiz


class FakeQuizLLM:
    name = "fake"

    def generate(self, text, num_questions):
        return validate_quiz(
            {
                "questions": [
                    {
                        "text": f"Fake question {n}?",
                        "options": [f"Correct {n}", f"Wrong {n}a", f"Wrong {n}b", f"Wrong {n}c"],
                        "correct_option_index": 0,
                        "explanation": f"Fake explanation {n}.",
                    }
                    for n in range(1, num_questions + 1)
                ]
            },
            num_questions,
        )
