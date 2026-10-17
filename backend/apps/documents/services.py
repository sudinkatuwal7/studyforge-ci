"""Store an upload atomically, then hand off the committed document."""

import logging
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

from apps.documents.dispatch import DispatchFailed, DispatchUnconfirmed, dispatch_document
from apps.documents.errors import DocumentAPIError
from apps.documents.models import Document, Job
from apps.documents.serializers import DocumentSerializer


logger = logging.getLogger(__name__)


def store_and_dispatch(*, course, upload, title, sha256):
    document = Document(owner_id=course.owner_id, course=course, title=title, sha256=sha256)
    try:
        # The view opts out of ATOMIC_REQUESTS; durable=True prevents an accidental
        # outer transaction from allowing dispatch before this row is committed.
        with transaction.atomic(durable=True):
            document.file.save(f"{uuid4().hex}.pdf", upload, save=False)
            document.save()
            job = Job.objects.create(document=document)
            snapshot = DocumentSerializer(document).data
    except Exception as exc:
        if document.file.name and document.file._committed:
            try:
                document.file.storage.delete(document.file.name)
            except Exception:
                logger.exception("Failed to clean up an uncommitted PDF upload.")
        logger.exception("Could not persist PDF upload.")
        raise DocumentAPIError("UPLOAD_UNAVAILABLE", 503) from exc

    try:
        dispatch_document(job.pk, document.pk, document.sha256)
    except DispatchFailed as exc:
        try:
            with transaction.atomic():
                # Do not overwrite a state another writer has already advanced.
                changed = Document.objects.filter(
                    pk=document.pk, status=Document.Status.PENDING
                ).update(
                    status=Document.Status.FAILED,
                    error_code=Document.ErrorCode.PROCESSING_DISPATCH_FAILED,
                    updated_at=timezone.now(),
                )
                if changed:
                    Job.objects.filter(pk=job.pk, status=Job.Status.QUEUED).update(
                        status=Job.Status.FAILED
                    )
        except Exception:
            logger.exception("Could not persist dispatch failure for document %s.", document.pk)
            raise DocumentAPIError(
                "PROCESSING_HANDOFF_UNCONFIRMED", 503, document_id=document.pk
            ) from exc
        code = "PROCESSING_DISPATCH_FAILED" if changed else "PROCESSING_HANDOFF_UNCONFIRMED"
        raise DocumentAPIError(code, 503, document_id=document.pk) from exc
    except DispatchUnconfirmed as exc:
        raise DocumentAPIError(
            "PROCESSING_HANDOFF_UNCONFIRMED", 503, document_id=document.pk
        ) from exc

    return snapshot
