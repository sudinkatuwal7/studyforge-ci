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


def _required_text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise InvalidLLMOutput(f"{label} must be a non-empty string")
    return value.strip()


def _validate_key_concept(concept):
    if not isinstance(concept, dict):
        raise InvalidLLMOutput("key_concepts must hold objects")
    return {
        "term": _required_text(concept.get("term"), "term"),
        "explanation": _required_text(concept.get("explanation"), "explanation"),
    }


def _validate_section(section):
    if not isinstance(section, dict):
        raise InvalidLLMOutput("sections must hold objects")

    key_concepts = section.get("key_concepts")
    points = section.get("points")
    if not isinstance(key_concepts, list) or not isinstance(points, list):
        raise InvalidLLMOutput("key_concepts and points must be lists")
    if not key_concepts and not points:
        raise InvalidLLMOutput("A section needs key concepts or points")

    return {
        "heading": _required_text(section.get("heading"), "heading"),
        "key_concepts": [_validate_key_concept(concept) for concept in key_concepts],
        "points": [_required_text(point, "point") for point in points],
    }


def validate_course_notes(payload):
    """The validate_study_guide contract, for headed multi-material notes."""
    if not isinstance(payload, dict):
        raise InvalidLLMOutput(f"Expected an object, got {type(payload).__name__}")

    sections = payload.get("sections")
    if not isinstance(sections, list) or not sections:
        raise InvalidLLMOutput("sections must be a non-empty list")

    validated = [_validate_section(section) for section in sections]
    if not any(section["key_concepts"] for section in validated):
        raise InvalidLLMOutput("Notes need at least one key concept")

    return {
        "overview": _required_text(payload.get("overview"), "overview"),
        "sections": validated,
    }