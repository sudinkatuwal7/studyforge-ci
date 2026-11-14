"""Short, local transactions for processing and terminal callback state."""

from __future__ import annotations

import json
import re

from django.db import transaction
from django.utils import timezone

from executions.models import Execution

from .errors import PermanentProcessingError
from .result_client import serialize_callback


def get_or_create_execution(job_id: int, document_id: int, source_sha256: str) -> Execution:
    if (
        type(job_id) is not int or job_id <= 0
        or type(document_id) is not int or document_id <= 0
        or not isinstance(source_sha256, str)
        or re.fullmatch(r"[0-9a-f]{64}", source_sha256) is None
    ):
        raise PermanentProcessingError("Invalid processing task identity.")
    execution, _ = Execution.objects.get_or_create(
        job_id=job_id,
        defaults={"document_id": document_id, "source_sha256": source_sha256},
    )
    if execution.document_id != document_id or execution.source_sha256 != source_sha256:
        raise PermanentProcessingError("Processing task identity conflicts with the stored execution.")
    return execution


def start_or_resume(job_id: int) -> tuple[int | None, dict | None]:
    """Start one processing attempt, or return an already staged result."""
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if execution.callback_payload is not None:
            return None, json.loads(execution.callback_payload)
        if execution.status in {Execution.Status.SUCCEEDED, Execution.Status.FAILED}:
            raise PermanentProcessingError("Terminal execution has no saved callback.")
        if execution.status == Execution.Status.QUEUED:
            execution.attempts += 1
            execution.status = Execution.Status.RUNNING
            execution.error_code = ""
            execution.save(update_fields=["attempts", "status", "error_code", "updated_at"])
        return execution.attempts, None


def prepare_processing_retry(job_id: int) -> None:
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if execution.callback_payload is None:
            execution.status = Execution.Status.QUEUED
            execution.save(update_fields=["status", "updated_at"])


def stage_terminal(job_id: int, payload: dict) -> dict:
    """Persist the first terminal callback; later workers replay that exact result."""
    if payload.get("status") not in {"SUCCEEDED", "FAILED"}:
        raise PermanentProcessingError("Only terminal callbacks can be staged.")
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if (
            payload.get("job_id") != execution.job_id
            or payload.get("document_id") != execution.document_id
            or payload.get("source_sha256") != execution.source_sha256
        ):
            raise PermanentProcessingError("Terminal callback identity does not match the execution.")
        if execution.callback_payload is not None:
            return json.loads(execution.callback_payload)
        if payload.get("attempt") != execution.attempts or execution.status != Execution.Status.RUNNING:
            raise PermanentProcessingError("Terminal callback attempt does not match the running execution.")
        serialized = serialize_callback(payload)
        execution.callback_payload = serialized
        execution.status = payload["status"]
        execution.error_code = payload.get("error_code", "")
        execution.delivery_status = Execution.DeliveryStatus.PENDING
        execution.save(update_fields=[
            "callback_payload", "status", "error_code", "delivery_status", "updated_at",
        ])
    return payload


def begin_delivery(job_id: int, max_attempts: int) -> tuple[dict, str, int, bool]:
    """Count an actual send before making the HTTP call, without holding a lock."""
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if execution.callback_payload is None:
            raise PermanentProcessingError("No terminal callback has been staged.")
        should_send = (
            execution.delivery_status == Execution.DeliveryStatus.PENDING
            and execution.delivery_attempts < max_attempts
        )
        if should_send:
            execution.delivery_attempts += 1
            execution.save(update_fields=["delivery_attempts", "updated_at"])
        return (
            json.loads(execution.callback_payload),
            execution.delivery_status,
            execution.delivery_attempts,
            should_send,
        )


def mark_delivered(job_id: int) -> None:
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if execution.delivery_status != Execution.DeliveryStatus.DELIVERED:
            # A successful acknowledgement wins over a concurrent rejection.
            execution.delivery_status = Execution.DeliveryStatus.DELIVERED
            execution.delivered_at = timezone.now()
            execution.save(update_fields=["delivery_status", "delivered_at", "updated_at"])


def mark_rejected(job_id: int) -> None:
    with transaction.atomic():
        execution = Execution.objects.select_for_update().get(job_id=job_id)
        if execution.delivery_status == Execution.DeliveryStatus.PENDING:
            execution.delivery_status = Execution.DeliveryStatus.REJECTED
            execution.save(update_fields=["delivery_status", "updated_at"])
