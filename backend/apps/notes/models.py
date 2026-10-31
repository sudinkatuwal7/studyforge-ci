from django.conf import settings
from django.db import models


class CourseNotes(models.Model):
    """Notes generated from one or more materials in a course.

    Each generation is a new row, so a later set of notes never overwrites
    one built from a different selection.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="course_notes",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="course_notes",
    )
    title = models.CharField(max_length=255)
    overview = models.TextField()
    # [{"heading": str, "key_concepts": [{"term": str, "explanation": str}],
    #   "points": [str]}], shaped by validate_course_notes.
    sections = models.JSONField(default=list)
    # Deleting any of these also deletes the notes; see apps.notes.signals.
    source_documents = models.ManyToManyField(
        "documents.Document",
        related_name="course_notes",
    )
    model_name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "course notes"

    def __str__(self):
        return self.title


class StudyGuide(models.Model):
    """Generated notes for one document. One guide per document;
    regenerating overwrites it."""

    document = models.OneToOneField(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="study_guide",
    )
    key_concepts = models.JSONField(default=list)
    important_points = models.JSONField(default=list)
    summary = models.TextField(blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Study guide for document {self.document_id}"