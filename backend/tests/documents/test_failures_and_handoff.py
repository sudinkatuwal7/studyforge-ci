"""File/DB failure compensation and the upload-owned processing boundary."""

from datetime import datetime
from unittest.mock import Mock

import pytest
from django.db import DatabaseError, connections

from apps.documents.dispatch import DispatchFailed, DispatchUnconfirmed, dispatch_document
from apps.documents.models import Document, Job


@pytest.mark.django_db(transaction=True)
class TestUploadFailuresAndHandoff:
    def test_storage_failure_is_safe(self, upload, monkeypatch, assert_error, assert_no_upload):
        storage = Document._meta.get_field("file").storage
        monkeypatch.setattr(storage, "save", Mock(side_effect=OSError("private/path secret detail")))
        response = upload()
        body = assert_error(response, 503, "UPLOAD_UNAVAILABLE")
        assert "private/path" not in body["message"] and "secret" not in body["message"]
        assert_no_upload()


    @pytest.mark.parametrize("failure_point", ["document", "job", "commit"])
    def test_database_failure_removes_only_this_upload(
        self,
        failure_point, upload, document_factory, monkeypatch, media_root, assert_error, dispatch
    ):
        existing = document_factory()
        existing_name = existing.file.name
        storage = existing.file.storage
        if failure_point == "document":
            monkeypatch.setattr(Document, "save", Mock(side_effect=DatabaseError("private DB detail")))
        elif failure_point == "job":
            monkeypatch.setattr(Job.objects, "create", Mock(side_effect=DatabaseError("private DB detail")))
        else:
            monkeypatch.setattr(connections["default"], "commit", Mock(side_effect=DatabaseError("commit failed")))
        response = upload()
        assert_error(response, 503, "UPLOAD_UNAVAILABLE")
        assert Document.objects.count() == 1
        assert Document.objects.get().pk == existing.pk
        assert not Job.objects.exists()
        assert storage.exists(existing_name)
        assert len([path for path in media_root.rglob("*") if path.is_file()]) == 1
        dispatch.assert_not_called()


    def test_cleanup_failure_is_logged_without_leaking_paths(
        self,
        upload, monkeypatch, caplog, assert_error, media_root, dispatch
    ):
        storage = Document._meta.get_field("file").storage
        monkeypatch.setattr(Job.objects, "create", Mock(side_effect=DatabaseError("DB secret")))
        monkeypatch.setattr(storage, "delete", Mock(side_effect=OSError("private/storage/path")))
        response = upload()
        assert_error(response, 503, "UPLOAD_UNAVAILABLE")
        assert "private/storage/path" not in response.content.decode()
        assert "Failed to clean up" in caplog.text
        assert not Document.objects.exists() and not Job.objects.exists()
        assert len(list(media_root.rglob("*.pdf"))) == 1  # Temporary fixture removes the orphan.
        dispatch.assert_not_called()


    def test_dispatch_observes_committed_rows_from_another_connection(self, upload, dispatch):
        def handoff(job_id, document_id, source_sha256):
            other_connection = connections["default"].copy(alias="handoff-observer")
            try:
                with other_connection.cursor() as cursor:
                    cursor.execute("SELECT status FROM documents_document WHERE id = %s", [document_id])
                    assert cursor.fetchone() == ("PENDING",)
                    cursor.execute("SELECT status FROM documents_job WHERE document_id = %s", [document_id])
                    assert cursor.fetchone() == ("QUEUED",)
            finally:
                other_connection.close()
        dispatch.side_effect = handoff
        response = upload()
        assert response.status_code == 201, response.content
        document = Document.objects.get(pk=response.json()["id"])
        job = document.jobs.get()
        dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)


    def test_fast_worker_does_not_change_creation_snapshot(self, upload, dispatch, owner_client):
        def handoff(job_id, document_id, source_sha256):
            document = Document.objects.get(pk=document_id)
            document.status = "PROCESSING"
            document.save(update_fields=["status"])
        dispatch.side_effect = handoff
        response = upload()
        assert response.status_code == 201
        assert response.json()["status"] == "PENDING"
        detail = owner_client.get(f"/api/v1/documents/{response.json()['id']}/")
        assert detail.json()["status"] == "PROCESSING"


    @pytest.mark.parametrize("failure,code,status,job_status", [
        (DispatchFailed, "PROCESSING_DISPATCH_FAILED", "FAILED", "FAILED"),
        (DispatchUnconfirmed, "PROCESSING_HANDOFF_UNCONFIRMED", "PENDING", "QUEUED"),
    ])
    def test_failed_handoff_preserves_document_and_file(
        self,
        failure, code, status, job_status, upload, dispatch, owner_client, assert_error
    ):
        dispatch.side_effect = failure("private broker details")
        response = upload()
        body = assert_error(response, 503, code, wrapped=True)
        assert "private broker" not in body["message"]
        document = Document.objects.get(pk=response.json()["document_id"])
        assert Document.objects.count() == Job.objects.count() == 1
        assert document.status == status
        assert document.file.storage.exists(document.file.name)
        assert document.jobs.get().status == job_status
        assert document.jobs.get().attempts == 0
        job = document.jobs.get()
        dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)
        detail = owner_client.get(f"/api/v1/documents/{document.pk}/")
        assert detail.status_code == 200
        assert detail.json()["status"] == status
        if status == "FAILED":
            assert detail.json()["error"] == body
            assert document.error_code == code
            assert document.updated_at > document.created_at
        else:
            assert document.error_code is None
            assert detail.json()["error"] is None
            assert document.updated_at == document.created_at


    @pytest.mark.parametrize("state", ["PROCESSING", "READY", "FAILED"])
    def test_uncertain_handoff_does_not_overwrite_advanced_state(
        self,
        state, upload, dispatch, assert_error, owner_client
    ):
        saved = {}
        def handoff(job_id, document_id, source_sha256):
            document = Document.objects.get(pk=document_id)
            document.status = state
            document.error_code = "PROCESSING_FAILED" if state == "FAILED" else None
            document.save(update_fields=["status", "error_code"])
            saved["timestamp"] = document.updated_at
            raise DispatchUnconfirmed
        dispatch.side_effect = handoff
        response = upload()
        assert_error(response, 503, "PROCESSING_HANDOFF_UNCONFIRMED", wrapped=True)
        document = Document.objects.get(pk=response.json()["document_id"])
        assert document.status == state
        assert document.updated_at == saved["timestamp"]
        detail = owner_client.get(f"/api/v1/documents/{document.pk}/").json()
        assert detail["status"] == state
        assert datetime.fromisoformat(detail["updated_at"]) == saved["timestamp"]


    def test_failure_report_cannot_overwrite_a_document_already_processing(self, upload, dispatch, assert_error):
        def handoff(job_id, document_id, source_sha256):
            Document.objects.filter(pk=document_id).update(status="PROCESSING")
            raise DispatchFailed
        dispatch.side_effect = handoff
        response = upload()
        assert_error(response, 503, "PROCESSING_HANDOFF_UNCONFIRMED", wrapped=True)
        document = Document.objects.get(pk=response.json()["document_id"])
        assert document.status == "PROCESSING"
        assert document.error_code is None
        assert document.jobs.get().status == "QUEUED"


@pytest.fixture
def publisher(monkeypatch):
    app = Mock()
    factory = Mock(return_value=app)
    monkeypatch.setattr("apps.documents.dispatch.Celery", factory)
    return app


def test_publisher_sends_job_document_and_digest_to_processing_queue_without_retries(publisher):
    digest = "a" * 64
    dispatch_document(17, 42, digest)
    publisher.connection_for_write.return_value.ensure_connection.assert_called_once_with(max_retries=0)
    publisher.send_task.assert_called_once_with(
        "processing_service.tasks.process_document_task",
        args=[17, 42, digest],
        queue="document-processing",
        producer=publisher.amqp.Producer.return_value,
        retry=False,
        ignore_result=True,
    )
    publisher.connection_for_write.return_value.release.assert_called_once()
    publisher.close.assert_called_once()


def test_connection_failure_is_definite_and_never_publishes(publisher):
    publisher.connection_for_write.return_value.ensure_connection.side_effect = OSError("connection refused")
    with pytest.raises(DispatchFailed):
        dispatch_document(17, 42, "a" * 64)
    publisher.send_task.assert_not_called()
    publisher.close.assert_called_once()


@pytest.mark.parametrize("failure", [TimeoutError, ConnectionError])
def test_send_failure_is_uncertain_and_not_retried(publisher, failure):
    publisher.send_task.side_effect = failure("connection lost")
    with pytest.raises(DispatchUnconfirmed):
        dispatch_document(17, 42, "a" * 64)
    assert publisher.send_task.call_count == 1


def test_cleanup_failure_does_not_change_successful_publication(publisher, caplog):
    publisher.connection_for_write.return_value.release.side_effect = OSError("close failed")
    dispatch_document(17, 42, "a" * 64)
    assert publisher.send_task.call_count == 1
    assert "Could not close the document task publisher" in caplog.text
