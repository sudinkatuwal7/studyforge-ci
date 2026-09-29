"""Chunk rows extracted from a document. Splitting and embeddings are later work."""

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from pgvector.django import VectorField


class Chunk(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    content = models.TextField()
    # No embedding model is chosen yet. An unsized vector column can be filled later.
    embedding = VectorField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(page_number__gte=1),
                name="chunk_page_number_positive",
            ),
        ]

    def __str__(self):
        return f"Chunk {self.pk} of document {self.document_id} page {self.page_number}"
