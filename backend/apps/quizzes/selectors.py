import math

from django.shortcuts import get_object_or_404

from apps.courses.models import Course
from apps.notes.selectors import get_ordered_chunks
from apps.quizzes.models import Quiz, QuizSubmission


def get_owned_course(user, course_id):
    """404 rather than 403 so the API never reveals that another
    student's course exists."""
    return get_object_or_404(Course, pk=course_id, owner=user)


def get_owned_quiz(user, quiz_id):
    return get_object_or_404(
        Quiz.objects.select_related("submission").prefetch_related("questions", "source_documents"),
        pk=quiz_id,
        owner=user,
    )


def get_owned_submission(user, quiz_id):
    """The graded submission for a quiz, or 404 when the quiz is not the
    user's or has not been submitted yet. The two cases look the same, so
    the API never reveals another student's quiz."""
    return get_object_or_404(
        QuizSubmission.objects.select_related("quiz").prefetch_related("answers__question"),
        quiz_id=quiz_id,
        quiz__owner=user,
    )


def _sample_evenly(chunks, budget):
    """Keep every k-th chunk so the sample spans the whole document,
    rather than its first pages only."""
    total = sum(len(chunk.content) for chunk in chunks)
    if total <= budget:
        return chunks
    return chunks[:: math.ceil(total / budget)]


def build_source_text(documents, char_budget):
    """The text a quiz is generated from, and the ids of any documents
    that produced none.

    The budget is split evenly across documents so a long reading cannot
    crowd out a short lecture the student also selected. Characters, not
    tokens — roughly 4 characters per token.
    """
    per_document = char_budget // len(documents)
    sections, empty_ids = [], []

    for document in documents:
        chunks = [chunk for chunk in get_ordered_chunks(document) if chunk.content.strip()]
        if not chunks:
            empty_ids.append(document.pk)
            continue

        # The stored suffix is set after upload validation and survives renaming.
        # DOCX has no physical pages; its chunk.page_number is schema compatibility only.
        source_format = document.file.name.rsplit(".", 1)[-1].lower()
        location_label = {"pdf": "Page", "pptx": "Slide"}.get(source_format)
        body = "\n\n".join(
            (f"[{location_label} {chunk.page_number}]\n" if location_label else "")
            + chunk.content.strip()
            for chunk in _sample_evenly(chunks, per_document)
        )
        # Chunks vary in size, so the sample can still overshoot slightly.
        sections.append(f"## {document.title}\n\n{body[:per_document]}")

    return "\n\n".join(sections), empty_ids
