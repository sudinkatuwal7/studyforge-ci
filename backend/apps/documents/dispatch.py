"""Publish a document processing job to the standalone worker queue."""

import logging

from celery import Celery


PROCESS_DOCUMENT_TASK = "processing_service.tasks.process_document_task"
PROCESS_DOCUMENT_QUEUE = "document-processing"
logger = logging.getLogger(__name__)


class DispatchFailed(Exception):
    """No task publication was attempted."""


class DispatchUnconfirmed(Exception):
    """Publication was attempted but its outcome is unknown."""


def dispatch_document(job_id, document_id, source_sha256):
    app = Celery("studyforge-upload", set_as_current=False)
    app.config_from_object("django.conf:settings", namespace="CELERY")
    connection = None
    try:
        try:
            connection = app.connection_for_write()
            # Connecting separately makes a pre-publication failure unambiguous.
            connection.ensure_connection(max_retries=0)
            producer = app.amqp.Producer(connection)
        except Exception as exc:
            raise DispatchFailed from exc

        try:
            app.send_task(
                PROCESS_DOCUMENT_TASK,
                args=[job_id, document_id, source_sha256],
                queue=PROCESS_DOCUMENT_QUEUE,
                producer=producer,
                retry=False,
                ignore_result=True,
            )
        except Exception as exc:
            # A timeout or broken connection during send can follow a successful
            # enqueue. Never retry or mark the document FAILED on that evidence.
            raise DispatchUnconfirmed from exc
    finally:
        try:
            if connection is not None:
                connection.release()
            app.close()
        except Exception:
            # Cleanup cannot undo a publication or replace its known outcome.
            logger.exception("Could not close the document task publisher.")
