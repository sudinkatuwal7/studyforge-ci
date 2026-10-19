"""Persistence only: uploading, dispatch, and processing live elsewhere."""

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone


class Document(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        READY = "READY", "Ready"
        FAILED = "FAILED", "Failed"

    class ErrorCode(models.TextChoices):
        PROCESSING_FAILED = "PROCESSING_FAILED", "Processing failed"
        PROCESSING_DISPATCH_FAILED = (
            "PROCESSING_DISPATCH_FAILED",
            "Processing dispatch failed",
        )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="documents",
    )
    title = models.CharField(max_length=255)
    sha256 = models.CharField(
        max_length=64,
        validators=[
            RegexValidator(
                regex=r"\A[0-9a-f]{64}\Z",
                message="Use a 64-character lowercase hexadecimal SHA-256 digest.",
            )
        ],
    )
    file = models.FileField(upload_to="documents/%Y/%m/", max_length=255)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    error_code = models.CharField(
        max_length=64,
        choices=ErrorCode.choices,
        null=True,
        blank=True,
        default=None,
    )
    page_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
        validators=[MinValueValidator(1)],
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=["PENDING", "PROCESSING", "READY", "FAILED"]),
                name="document_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(error_code__isnull=True)
                | models.Q(error_code__in=["PROCESSING_FAILED", "PROCESSING_DISPATCH_FAILED"]),
                name="document_error_code_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(page_count__isnull=True) | models.Q(page_count__gte=1),
                name="document_page_count_positive",
            ),
        ]

    def save(self, *, force_insert=False, force_update=False, using=None, update_fields=None):
        if update_fields is not None:
            update_fields = set(update_fields)
            if not update_fields:
                return

        now = timezone.now()
        if self._state.adding:
            self.created_at = now
        self.updated_at = now
        if update_fields is not None:
            update_fields.add("updated_at")

        return super().save(
            force_insert=force_insert,
            force_update=force_update,
            using=using,
            update_fields=update_fields,
        )

    def __str__(self):
        return self.title


class Job(models.Model):
    class Type(models.TextChoices):
        DOCUMENT_PROCESSING = "DOCUMENT_PROCESSING", "Document processing"

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        RUNNING = "RUNNING", "Running"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"

    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="jobs",
    )
    type = models.CharField(
        max_length=32,
        choices=Type.choices,
        default=Type.DOCUMENT_PROCESSING,
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    attempts = models.PositiveIntegerField(default=0)
    run_after = models.DateTimeField(null=True, blank=True, default=None)
    # Receipt of the validated terminal callback; never infer equality from status.
    terminal_callback_sha256 = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(type="DOCUMENT_PROCESSING"),
                name="job_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]),
                name="job_status_valid",
            ),
        ]
