"""Validate and atomically apply processing-service callbacks."""

import hashlib
import json
import math
import re

from django.db import transaction

from apps.documents.models import Document, Job
from apps.knowledge.models import Chunk

MAX_CALLBACK_BYTES = 2 * 1024 * 1024
EMBEDDING_DIMENSION = 768
MAX_CHUNK_CONTENT_LENGTH = 1000
SOURCE_SHA256_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class InvalidCallback(ValueError):
    """The processing callback does not satisfy the internal contract."""

    def __init__(self, code, *, status_code=400):
        super().__init__(code)
        self.status_code = status_code


def decode_callback(body: bytes) -> dict:
    if len(body) > MAX_CALLBACK_BYTES:
        raise InvalidCallback("callback_too_large", status_code=413)
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidCallback("invalid_json") from exc
    if not isinstance(payload, dict):
        raise InvalidCallback("invalid_payload")
    return payload


def apply_callback(job_id: int, payload: dict) -> str:
    status = _validate_envelope(job_id, payload)
    if status == "SUCCEEDED":
        chunks = _validate_chunks(payload["chunks"], payload["page_count"])
    else:
        chunks = None

    fingerprint = ""
    if status in {"SUCCEEDED", "FAILED"}:
        # Canonical key ordering allows JSON formatting changes on redelivery.
        # Include the attempt, scan indicator, ordered chunks, and all identity fields.
        fingerprint = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        ).hexdigest()

    with transaction.atomic():
        try:
            document_id = Job.objects.values_list("document_id", flat=True).get(pk=job_id)
            # Serialize every run of a document, locking in the same order as
            # upload dispatch failure handling: Document first, then Job.
            document = Document.objects.select_for_update().get(pk=document_id)
            job = Job.objects.select_for_update().get(pk=job_id)
        except (Job.DoesNotExist, Document.DoesNotExist) as exc:
            raise InvalidCallback("job_not_found", status_code=404) from exc

        if (
            document.pk != payload["document_id"]
            or document.sha256 != payload["source_sha256"]
        ):
            raise InvalidCallback("source_mismatch", status_code=409)

        if Job.objects.filter(document_id=document.pk, pk__gt=job.pk).exists():
            raise InvalidCallback("stale_job", status_code=409)
        if payload["attempt"] < job.attempts:
            raise InvalidCallback("stale_attempt", status_code=409)
        if job.status in {Job.Status.SUCCEEDED, Job.Status.FAILED}:
            if fingerprint and fingerprint == job.terminal_callback_sha256:
                return "duplicate"
            raise InvalidCallback("terminal_conflict", status_code=409)

        if status == "SUCCEEDED":
            suffix = "." + document.file.name.rsplit(".", 1)[-1].lower()
            if suffix == ".docx":
                if payload["page_count"] is not None:
                    raise InvalidCallback("invalid_page_count")
            elif suffix in {".pdf", ".pptx"}:
                if payload["page_count"] is None:
                    raise InvalidCallback("invalid_page_count")
            else:
                raise InvalidCallback("invalid_source_format")

        job.attempts = max(job.attempts, payload["attempt"])

        if status == "RUNNING":
            job.status = Job.Status.RUNNING
            document.status = Document.Status.PROCESSING
            document.error_code = None
            job.save(update_fields=["status", "attempts"])
            document.save(update_fields=["status", "error_code"])
            return "applied"

        if status == "FAILED":
            job.status = Job.Status.FAILED
            job.terminal_callback_sha256 = fingerprint
            document.status = Document.Status.FAILED
            document.error_code = Document.ErrorCode.PROCESSING_FAILED
            job.save(update_fields=["status", "attempts", "terminal_callback_sha256"])
            document.save(update_fields=["status", "error_code"])
            return "applied"

        Chunk.objects.filter(document=document).delete()
        Chunk.objects.bulk_create(
            [
                Chunk(
                    owner_id=document.owner_id,
                    document=document,
                    page_number=page_number,
                    content=content,
                    embedding=embedding,
                )
                for page_number, content, embedding in chunks
            ]
        )
        job.status = Job.Status.SUCCEEDED
        job.terminal_callback_sha256 = fingerprint
        document.status = Document.Status.READY
        document.error_code = None
        document.page_count = payload["page_count"]
        job.save(update_fields=["status", "attempts", "terminal_callback_sha256"])
        document.save(update_fields=["status", "error_code", "page_count"])
        return "applied"


def _validate_envelope(job_id: int, payload: dict) -> str:
    status = payload.get("status")
    if not isinstance(status, str):
        raise InvalidCallback("invalid_status")
    common = {"schema_version", "job_id", "document_id", "source_sha256", "status", "attempt"}
    status_fields = {
        "RUNNING": set(),
        "FAILED": {"error_code"},
        "SUCCEEDED": {"page_count", "likely_scanned", "chunks"},
    }
    if status not in status_fields or set(payload) != common | status_fields[status]:
        raise InvalidCallback("invalid_fields")
    if payload["schema_version"] != 1 or type(payload["schema_version"]) is not int:
        raise InvalidCallback("unsupported_schema")
    if type(payload["job_id"]) is not int or payload["job_id"] != job_id or job_id <= 0:
        raise InvalidCallback("invalid_job")
    if type(payload["document_id"]) is not int or payload["document_id"] <= 0:
        raise InvalidCallback("invalid_document")
    if not isinstance(payload["source_sha256"], str) or not SOURCE_SHA256_PATTERN.fullmatch(
        payload["source_sha256"]
    ):
        raise InvalidCallback("invalid_digest")
    if type(payload["attempt"]) is not int or payload["attempt"] < 1:
        raise InvalidCallback("invalid_attempt")
    if status == "FAILED" and payload["error_code"] != "PROCESSING_FAILED":
        raise InvalidCallback("invalid_error_code")
    if status == "SUCCEEDED":
        if payload["page_count"] is not None and (
            type(payload["page_count"]) is not int or payload["page_count"] < 1
        ):
            raise InvalidCallback("invalid_page_count")
        if type(payload["likely_scanned"]) is not bool:
            raise InvalidCallback("invalid_scan_indicator")
        if not isinstance(payload["chunks"], list):
            raise InvalidCallback("invalid_chunks")
    return status


def _validate_chunks(chunks: list, page_count: int | None) -> list[tuple[int, str, list[float]]]:
    if not chunks:
        # The existing worker treats 400 as permanent and reports FAILED.
        raise InvalidCallback("empty_extracted_content")
    validated = []
    for chunk in chunks:
        if not isinstance(chunk, dict) or set(chunk) != {"page_number", "content", "embedding"}:
            raise InvalidCallback("invalid_chunk")
        page_number = chunk["page_number"]
        content = chunk["content"]
        embedding = chunk["embedding"]
        if type(page_number) is not int or not 1 <= page_number <= (page_count or 1):
            raise InvalidCallback("invalid_chunk_page")
        if (
            not isinstance(content, str)
            or not content.strip()
            or len(content) > MAX_CHUNK_CONTENT_LENGTH
        ):
            raise InvalidCallback("invalid_chunk_content")
        if not isinstance(embedding, list) or len(embedding) != EMBEDDING_DIMENSION:
            raise InvalidCallback("invalid_embedding")
        vector = []
        for value in embedding:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise InvalidCallback("invalid_embedding")
            try:
                numeric_value = float(value)
            except (OverflowError, ValueError) as exc:
                raise InvalidCallback("invalid_embedding") from exc
            if not math.isfinite(numeric_value):
                raise InvalidCallback("invalid_embedding")
            vector.append(numeric_value)
        if not any(vector):
            raise InvalidCallback("invalid_embedding")
        validated.append((page_number, content, vector))
    return validated
