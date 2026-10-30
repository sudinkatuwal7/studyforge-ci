import os

from django.db import transaction
from django.http import Http404

from apps.documents.models import Document
from apps.notes.llm import get_client
from apps.notes.models import CourseNotes, StudyGuide
from apps.notes.selectors import build_note_sources, get_ordered_chunks

# Characters, roughly 4 per token. Generation runs inside one HTTP request, so
# this bounds how many model calls a student can wait on (and the class key can
# pay for). Overridable so the limit can be tuned without a release.
DEFAULT_NOTES_TOTAL_CHAR_LIMIT = 600_000


class EmptyDocumentError(Exception):
    """A READY document that produced no usable text."""


class EmptyMaterialsError(Exception):
    """Selected READY materials that produced no usable text."""

    def __init__(self, document_ids):
        super().__init__(f"No readable text in documents {document_ids}")
        self.document_ids = document_ids


class NotesInputTooLargeError(Exception):
    """The selected materials exceed what one request may process."""


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


def _build_title(documents):
    title = "Notes: " + ", ".join(document.title for document in documents)
    max_length = CourseNotes._meta.get_field("title").max_length
    return title if len(title) <= max_length else title[: max_length - 1] + "…"


def generate_course_notes(owner, course, documents, client=None):
    """Generate and save notes from documents the caller has already checked
    are owned, in `course`, and READY.

    `client` can be injected so tests control the model output.
    """
    # Upload order, however they were ticked: lectures usually go up in the
    # order they were taught, and the notes keep the materials' order.
    documents = sorted(documents, key=lambda document: document.pk)

    sources, empty_ids = build_note_sources(documents)
    if empty_ids:
        raise EmptyMaterialsError(empty_ids)

    limit = int(os.environ.get("NOTES_TOTAL_CHAR_LIMIT", DEFAULT_NOTES_TOTAL_CHAR_LIMIT))
    if sum(len(text) for _, text in sources) > limit:
        raise NotesInputTooLargeError

    # The model call happens before the transaction opens: it can take many
    # seconds and must not hold a database connection in a transaction.
    client = client or get_client()
    result = client.generate_notes(sources)

    document_ids = [document.pk for document in documents]
    with transaction.atomic():
        # A material deleted during the model call must not come back through
        # these notes. The row locks make this safe against a delete in flight.
        current = Document.objects.select_for_update().filter(
            pk__in=document_ids, status=Document.Status.READY
        ).order_by("pk")
        if len(current) != len(document_ids):
            raise Http404("No such documents.")

        notes = CourseNotes.objects.create(
            owner=owner,
            course=course,
            title=_build_title(documents),
            overview=result["overview"],
            sections=result["sections"],
            model_name=client.name,
        )
        notes.source_documents.set(documents)
    return notes
