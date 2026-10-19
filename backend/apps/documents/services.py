"""Document storage, processing handoff, and synchronous material deletion."""

import logging
from uuid import uuid4

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from apps.documents.dispatch import DispatchFailed, DispatchUnconfirmed, dispatch_document
from apps.documents.errors import DocumentAPIError
from apps.documents.models import Document, Job
from apps.documents.serializers import DocumentSerializer
from apps.identity.ownership import owned_documents


logger = logging.getLogger(__name__)


def locked_material(document_id, owner):
    # SCRUM-118 locks the Document before its Job. Use that same order.
    document = owned_documents(owner).select_for_update(of=("self",)).filter(
        pk=document_id
    ).first()
    if document is None:
        raise Http404
    return document


def delete_material(document_id, owner):
    try:
        with transaction.atomic(durable=True):
            document = locked_material(document_id, owner)
            storage, name = document.file.storage, document.file.name
            document.delete()
            # SQL failures occur before removing the file; storage failures roll
            # back the cascades. Filesystem deletion cannot be rolled back if the
            # subsequent database commit fails (see the API contract).
            if name:
                try:
                    storage.delete(name)
                except FileNotFoundError:
                    pass
    except Http404:
        raise
    except Exception as exc:
        logger.exception("Could not delete document %s.", document_id)
        raise DocumentAPIError("MATERIAL_UNAVAILABLE", 503) from exc


def store_and_dispatch(*, course, upload, title, sha256, suffix=".pdf"):
    document = Document(owner_id=course.owner_id, course=course, title=title, sha256=sha256)
    try:
        # The view opts out of ATOMIC_REQUESTS; durable=True prevents an accidental
        # outer transaction from allowing dispatch before this row is committed.
        with transaction.atomic(durable=True):
            document.file.save(f"{uuid4().hex}{suffix}", upload, save=False)
            document.save()
            job = Job.objects.create(document=document)
            snapshot = DocumentSerializer(document).data
    except Exception as exc:
        if document.file.name and document.file._committed:
            try:
                document.file.storage.delete(document.file.name)
            except Exception:
                logger.exception("Failed to clean up an uncommitted document upload.")
        logger.exception("Could not persist document upload.")
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
