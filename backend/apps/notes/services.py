from apps.notes.llm import get_client
from apps.notes.models import StudyGuide
from apps.notes.selectors import get_ordered_chunks


class EmptyDocumentError(Exception):
    """A READY document that produced no usable text."""


def generate_study_guide(document, text=None):
    """Create or replace the study guide for a document.

    `text` can be injected to bypass the database, which is what the
    tests use to work with known content.
    """
    if text is None:
        text = "\n\n".join(chunk.content for chunk in get_ordered_chunks(document))

    if not text.strip():
        raise EmptyDocumentError(
            "This document finished processing but produced no readable text."
        )

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
