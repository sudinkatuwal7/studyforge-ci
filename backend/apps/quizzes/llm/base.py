"""What every quiz generator must satisfy, and the validator that stands
between a model and our database."""

ALLOWED_QUESTION_COUNTS = (5, 10)

# Exactly four, even though Question allows two or more: the quiz UI is
# built around four choices, and a model that returns three has misread
# the prompt.
OPTION_COUNT = 4


class LLMError(Exception):
    """The provider failed in a way we cannot recover from."""


class InvalidLLMOutput(LLMError):
    """The provider returned something that is not a valid quiz."""


def _non_blank_string(value):
    return isinstance(value, str) and bool(value.strip())


def _validate_question(number, question):
    if not isinstance(question, dict):
        raise InvalidLLMOutput(f"Question {number} must be an object")

    if not _non_blank_string(question.get("text")):
        raise InvalidLLMOutput(f"Question {number} text must be a non-empty string")

    options = question.get("options")
    if (
        not isinstance(options, list)
        or len(options) != OPTION_COUNT
        or not all(_non_blank_string(option) for option in options)
    ):
        raise InvalidLLMOutput(
            f"Question {number} must have exactly {OPTION_COUNT} non-empty text options"
        )
    # Two options that read the same would make the question unanswerable.
    if len({option.strip().casefold() for option in options}) != OPTION_COUNT:
        raise InvalidLLMOutput(f"Question {number} has duplicate options")

    index = question.get("correct_option_index")
    # bool is a subclass of int; `true` is not an option index.
    if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < OPTION_COUNT:
        raise InvalidLLMOutput(
            f"Question {number} correct_option_index must be an integer from 0 to {OPTION_COUNT - 1}"
        )

    if not _non_blank_string(question.get("explanation")):
        raise InvalidLLMOutput(f"Question {number} explanation must be a non-empty string")

    # Return only our keys — a model that adds extras doesn't get to store them.
    return {
        "text": question["text"].strip(),
        "options": [option.strip() for option in options],
        "correct_option_index": index,
        "explanation": question["explanation"].strip(),
    }


def validate_quiz(payload, num_questions):
    """Reject anything that is not a well-formed quiz of `num_questions`.

    Model output is untrusted input. It can be prose instead of JSON, the
    wrong number of questions, or an answer index that points nowhere.
    Nothing unvalidated reaches the database.
    """
    if not isinstance(payload, dict):
        raise InvalidLLMOutput(f"Expected an object, got {type(payload).__name__}")

    questions = payload.get("questions")
    if not isinstance(questions, list):
        raise InvalidLLMOutput("questions must be a list")
    if len(questions) != num_questions:
        raise InvalidLLMOutput(f"Expected {num_questions} questions, got {len(questions)}")

    return {
        "questions": [
            _validate_question(number, question)
            for number, question in enumerate(questions, start=1)
        ]
    }
