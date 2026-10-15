"""Execution persistence only. Worker lifecycle behavior belongs to SCRUM-108."""

from django.core.validators import RegexValidator
from django.db import models


class Execution(models.Model):
    class Status(models.TextChoices):
        QUEUED = "QUEUED"
        RUNNING = "RUNNING"
        SUCCEEDED = "SUCCEEDED"
        FAILED = "FAILED"

    # External identifiers, never cross-database foreign keys.
    job_id = models.PositiveBigIntegerField(unique=True)
    document_id = models.PositiveBigIntegerField(db_index=True)
    source_sha256 = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"\A[0-9a-f]{64}\Z", "Expected a lowercase SHA-256 digest.")],
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    error_code = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(job_id__gt=0), name="execution_job_positive"),
            models.CheckConstraint(condition=models.Q(document_id__gt=0), name="execution_document_positive"),
            models.CheckConstraint(
                condition=models.Q(status__in=["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]),
                name="execution_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(source_sha256__regex=r"^[0-9a-f]{64}$"),
                name="execution_sha256_valid",
            ),
        ]
