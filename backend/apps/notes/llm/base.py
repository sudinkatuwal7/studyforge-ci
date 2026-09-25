"""What every study-guide generator must satisfy, and the validator
that stands between a model and our database."""

REQUIRED_KEYS = ("key_concepts", "important_points", "summary")


class LLMError(Exception):
    """The provider failed in a way we cannot recover from."""


class InvalidLLMOutput(LLMError):
    """The provider returned something that is not a valid study guide."""


def validate_study_guide(payload):
    """Reject anything that is not a well-formed study guide.

    Model output is untrusted input. It can be prose instead of JSON,
    truncated mid-object, or the right keys holding the wrong types.
    Nothing unvalidated reaches the database.
    """
    if not isinstance(payload, dict):
        raise InvalidLLMOutput(f"Expected an object, got {type(payload).__name__}")

    missing = [key for key in REQUIRED_KEYS if key not in payload]
    if missing:
        raise InvalidLLMOutput(f"Missing keys: {', '.join(missing)}")

    for key in ("key_concepts", "important_points"):
        value = payload[key]
        if not isinstance(value, list) or not all(isinstance(i, str) for i in value):
            raise InvalidLLMOutput(f"{key} must be a list of strings")
        if not value:
            raise InvalidLLMOutput(f"{key} came back empty")

    if not isinstance(payload["summary"], str) or not payload["summary"].strip():
        raise InvalidLLMOutput("summary must be a non-empty string")

    # Return only our keys — a model that adds extras doesn't get to store them.
    return {key: payload[key] for key in REQUIRED_KEYS}