from django.db import models


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