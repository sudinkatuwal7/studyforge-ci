"""Use the SCRUM-108 task and HTTP clients against real Django handlers.

Only HTTP transport, broker publication, and the paid embedding provider are
replaced. PDF retrieval, integrity checks, parsing, callbacks, and persistence
execute their production code against isolated storage and PostgreSQL.
"""

from email.message import Message
from io import BytesIO
import json
import math
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlsplit
from unittest.mock import Mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.test import Client

from apps.documents.models import Document, Job
from apps.knowledge.models import Chunk
from apps.notes.selectors import get_ordered_chunks


@pytest.fixture
def worker_bridge(monkeypatch, settings):
    service_path = Path(__file__).resolve().parents[3] / "services" / "document-processing"
    monkeypatch.syspath_prepend(str(service_path))
    from processing_service import errors, result_client, source_client, tasks

    settings.PROCESSING_SERVICE_TOKEN = "integration-service-token"
    settings.PROCESSING_DJANGO_API_URL = "http://testserver"
    client = Client(enforce_csrf_checks=True)
    callbacks = []

    def transport(request, **kwargs):
        path = urlsplit(request.full_url).path
        headers = {"HTTP_AUTHORIZATION": request.get_header("Authorization")}
        if request.get_method() == "GET":
            response = client.get(path, **headers)
        else:
            response = client.post(
                path, data=request.data, content_type=request.get_header("Content-type"), **headers,
            )
            callbacks.append((json.loads(request.data), response.status_code))
        body = b"".join(response.streaming_content) if response.streaming else response.content
        response.close()
        if response.status_code >= 400:
            raise HTTPError(request.full_url, response.status_code, "Rejected", response.headers, BytesIO(body))
        stream = BytesIO(body)
        stream.status = response.status_code
        stream.headers = Message()
        for key, value in response.items():
            stream.headers[key] = value
        return stream

    monkeypatch.setattr(source_client, "build_opener", lambda *args: SimpleNamespace(open=transport))
    monkeypatch.setattr(result_client, "urlopen", transport)
    embed = Mock(side_effect=lambda texts: [[0.25] * 768 for _ in texts])
    monkeypatch.setattr(tasks, "embed_texts", embed)
    return SimpleNamespace(task=tasks.process_document_task, errors=errors, results=result_client,
                           callbacks=callbacks, embed=embed)


def upload_job(owner_client, course, pdf_factory, kind="text"):
    response = owner_client.post(
        f"/api/v1/courses/{course.pk}/documents/",
        {"file": SimpleUploadedFile("lecture.pdf", pdf_factory(kind), content_type="application/pdf")},
        format="multipart",
    )
    assert response.status_code == 201
    document = Document.objects.get(pk=response.json()["id"])
    return document, document.jobs.get()


@pytest.mark.django_db(transaction=True)
def test_uploaded_pdf_reaches_ready_and_identical_redelivery_is_acknowledged(
    worker_bridge, owner_client, course, pdf_factory, dispatch,
):
    document, job = upload_job(owner_client, course, pdf_factory)
    dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)
    result = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    assert worker_bridge.results.submit_callback(job.pk, result) == "duplicate"
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert job.attempts == 1
    assert document.status == Document.Status.READY
    assert document.page_count == 1
    assert Chunk.objects.filter(document=document).count() == len(result["chunks"]) > 0
    assert all(chunk.owner_id == document.owner_id for chunk in document.chunks.all())
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["status"] == "READY"


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("suffix,page_count,locations", [
    (".docx", None, [1]),
    (".pptx", 2, [1, 2]),
])
def test_uploaded_office_uses_existing_worker_callback_and_notes_path(
    suffix, page_count, locations, worker_bridge, owner_client, course, office_factory, dispatch,
):
    source = office_factory(suffix)
    response = owner_client.post(
        f"/api/v1/courses/{course.pk}/documents/",
        {"file": SimpleUploadedFile("lecture" + suffix, source, content_type="text/plain")},
        format="multipart",
    )
    assert response.status_code == 201, response.content
    document = Document.objects.get(pk=response.json()["id"])
    job = document.jobs.get()
    dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)

    result = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    assert [payload["status"] for payload, _ in worker_bridge.callbacks] == ["RUNNING", "SUCCEEDED"]
    assert worker_bridge.results.submit_callback(job.pk, result) == "duplicate"
    document.refresh_from_db()
    job.refresh_from_db()
    assert document.status == Document.Status.READY
    assert job.status == Job.Status.SUCCEEDED
    assert document.page_count == page_count
    chunks = list(get_ordered_chunks(document))
    assert chunks
    assert sorted({chunk.page_number for chunk in chunks}) == locations
    assert all(chunk.owner_id == document.owner_id for chunk in chunks)
    assert all(len(chunk.embedding) == 768 and all(math.isfinite(x) for x in chunk.embedding) for chunk in chunks)
    text = "\n".join(chunk.content for chunk in chunks)
    if suffix == ".docx":
        assert "[Heading 2] Course outline" in text
        assert "[Table row] Concept | Definition" in text
    else:
        assert "[Slide 1: Overview]" in text
        assert "[Slide 2: Details]" in text
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["status"] == "READY"


@pytest.mark.django_db(transaction=True)
def test_empty_extraction_becomes_controlled_failure_without_retry(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    document, job = upload_job(owner_client, course, pdf_factory, "scanned")
    retry = Mock(side_effect=AssertionError("Empty content must not retry"))
    monkeypatch.setattr(worker_bridge.task, "retry", retry)
    with pytest.raises(worker_bridge.errors.PermanentProcessingError):
        worker_bridge.task.run(job.pk, document.pk, document.sha256)
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.FAILED
    assert document.status == Document.Status.FAILED
    assert document.error_code == "PROCESSING_FAILED"
    assert not document.chunks.exists()
    assert [(payload["status"], code) for payload, code in worker_bridge.callbacks] == [
        ("RUNNING", 200), ("SUCCEEDED", 400), ("FAILED", 200),
    ]
    retry.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_superseded_worker_stops_on_conflict_before_processing(
    worker_bridge, owner_client, course, pdf_factory,
):
    document, job = upload_job(owner_client, course, pdf_factory)
    Job.objects.create(document=document)
    with pytest.raises(worker_bridge.errors.PermanentProcessingError):
        worker_bridge.task.run(job.pk, document.pk, document.sha256)
    worker_bridge.embed.assert_not_called()
    assert worker_bridge.callbacks[0][1] == 409
    document.refresh_from_db()
    assert document.status == Document.Status.PENDING


@pytest.mark.django_db(transaction=True)
def test_oversized_worker_result_reports_failure_without_retry(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    from processing_service import tasks
    from processing_service.chunking import TextChunk

    document, job = upload_job(owner_client, course, pdf_factory)
    monkeypatch.setattr(tasks, "chunk_pages", lambda pages: [TextChunk(1, "x" * 1000)] * 500)
    retry = Mock(side_effect=AssertionError("Oversized content must not retry"))
    monkeypatch.setattr(worker_bridge.task, "retry", retry)
    with pytest.raises(worker_bridge.errors.PermanentProcessingError, match="size limit"):
        worker_bridge.task.run(job.pk, document.pk, document.sha256)
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.FAILED
    assert document.status == Document.Status.FAILED
    assert document.error_code == "PROCESSING_FAILED"
    assert not document.chunks.exists()
    # The result client rejects the oversized body before it reaches the network.
    assert [(payload["status"], code) for payload, code in worker_bridge.callbacks] == [
        ("RUNNING", 200), ("FAILED", 200),
    ]
    retry.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_persistence_outage_allows_original_callback_to_be_redelivered(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    from celery.exceptions import Retry

    document, job = upload_job(owner_client, course, pdf_factory)
    retry = Mock(side_effect=Retry())
    monkeypatch.setattr(worker_bridge.task, "retry", retry)
    with monkeypatch.context() as failure:
        failure.setattr(Chunk.objects, "bulk_create", Mock(side_effect=DatabaseError("offline")))
        with pytest.raises(Retry):
            worker_bridge.task.run(job.pk, document.pk, document.sha256)
    payload, code = worker_bridge.callbacks[-1]
    assert code == 503
    assert payload["status"] == "SUCCEEDED"
    job.refresh_from_db()
    assert job.status == Job.Status.RUNNING
    assert job.terminal_callback_sha256 == ""
    assert not document.chunks.exists()
    # Exercise receiver support for redelivery, retaining the original attempt.
    # Scheduling this redelivery independently belongs to the SCRUM-108 worker.
    assert worker_bridge.results.submit_callback(job.pk, payload) == "applied"
    assert worker_bridge.results.submit_callback(job.pk, payload) == "duplicate"
    job.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert job.attempts == payload["attempt"] == 1
    worker_bridge.embed.assert_called_once()
