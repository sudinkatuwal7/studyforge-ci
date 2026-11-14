"""Processing executions and durable terminal callback delivery state."""

from django.core.validators import RegexValidator
from django.db import models


class Execution(models.Model):
    class Status(models.TextChoices):
        QUEUED = "QUEUED"
        RUNNING = "RUNNING"
        SUCCEEDED = "SUCCEEDED"
        FAILED = "FAILED"

    class DeliveryStatus(models.TextChoices):
        NOT_STAGED = "NOT_STAGED"
        PENDING = "PENDING"
        DELIVERED = "DELIVERED"
        REJECTED = "REJECTED"

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
    callback_payload = models.TextField(null=True, default=None)
    delivery_status = models.CharField(
        max_length=16, choices=DeliveryStatus.choices,
        default=DeliveryStatus.NOT_STAGED, db_index=True,
    )
    delivery_attempts = models.PositiveIntegerField(default=0)
    delivered_at = models.DateTimeField(null=True, default=None)
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
                condition=models.Q(delivery_status__in=["NOT_STAGED", "PENDING", "DELIVERED", "REJECTED"]),
                name="execution_delivery_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(source_sha256__regex=r"^[0-9a-f]{64}$"),
                name="execution_sha256_valid",
            ),
        ]
