from apps.notes.llm import get_client
from apps.notes.models import StudyGuide


def generate_study_guide(document, text=None):
    """Create or replace the study guide for a document.

    `text` is injected for now. SCRUM-69 replaces the fallback with a
    real read of the document's ordered chunks.
    """
    if text is None:
        text = _placeholder_text(document)

    client = get_client()
    result = client.generate(text)

    guide, _ = StudyGuide.objects.update_or_create(
        document=document,
        defaults={
            "key_concepts": result["key_concepts"],
            "important_points": result["important_points"],
            "summary": result["summary"],
            "model_name": client.name,
        },
    )
    return guide


def _placeholder_text(document):
    """TODO(SCRUM-69): replace with ordered chunks once SCRUM-17 lands."""
    return "Placeholder document text."