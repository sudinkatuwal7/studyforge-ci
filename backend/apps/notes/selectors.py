from django.shortcuts import get_object_or_404

from apps.courses.models import Course
from apps.documents.models import Document
from apps.identity.ownership import owned_documents
from apps.notes.models import CourseNotes


def get_owned_course(user, course_id):
    return get_object_or_404(Course, pk=course_id, owner=user)


def get_owned_notes(user, notes_id):
    return get_object_or_404(
        CourseNotes.objects.prefetch_related("sources"),
        pk=notes_id,
        owner=user,
    )


def list_owned_notes(user, course_id=None):
    """The student's saved notes, newest first, optionally for one course.

    Another student's course id simply matches nothing, so the filter never
    reveals whether that course exists.
    """
    notes = CourseNotes.objects.filter(owner=user).select_related("course").order_by("-created_at", "-pk")
    if course_id is not None:
        notes = notes.filter(course_id=course_id)
    return notes


def get_source_documents(notes):
    """[{"id", "name"}] for the materials the notes were built from, in order.

    Sources are plain ids, so the names are looked up here, scoped to the
    notes' owner: an id can never surface another student's title. An id with
    no matching material is left out rather than failing the read; deleting a
    material normally deletes its notes (apps.notes.signals).
    """
    document_ids = [source.document_id for source in notes.sources.all()]
    names = dict(
        owned_documents(notes.owner_id)
        .filter(pk__in=document_ids)
        .values_list("pk", "title")
    )
    return [
        {"id": document_id, "name": names[document_id]}
        for document_id in document_ids
        if document_id in names
    ]


def build_note_sources(documents):
    """(title, full text) for each document, and the ids of any with no text.

    The full text, unlike a quiz's sample: notes that silently skip pages
    would look complete while missing content.
    """
    sources, empty_ids = [], []

    for document in documents:
        contents = get_ordered_chunks(document).values_list("content", flat=True)
        text = "\n\n".join(content.strip() for content in contents if content.strip())
        if text:
            sources.append((document.title, text))
        else:
            empty_ids.append(document.pk)

    return sources, empty_ids


def get_owned_document(user, document_id):
    """Fetch a document owned by this user, or raise 404.

    404 rather than 403 so the API never reveals that another student's
    document exists.

    Document carries a direct `owner` FK (SCRUM-9), so ownership is a
    single field check, not a join through Course.
    """
    return get_object_or_404(Document, pk=document_id, owner=user,
                             course__owner=user, conversation__isnull=True)

def get_ordered_chunks(document):
    """Every chunk of a document, in reading order.

    The only place that knows the Chunk model's field names.

    Ordered by page, then primary key. Chunk carries no explicit sequence
    field (SCRUM-17), so `id` is the tiebreaker when one page produces
    several chunks — it preserves the order they were created in.
    """
    return document.chunks.order_by("page_number", "id")
