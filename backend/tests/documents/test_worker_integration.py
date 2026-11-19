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
import sys
from types import ModuleType
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from unittest.mock import Mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.documents.models import Document, Job
from apps.knowledge.models import Chunk
from apps.knowledge.retrieval import retrieve_chunks
from apps.notes.llm import DEFAULT_NOTE_OPTIONS
from apps.notes.llm.fake import FakeStudyGuideLLM
from apps.notes.selectors import get_ordered_chunks


class InMemoryExecutionStore:
    """Worker-side seam; Django still owns only its own application database."""

    def __init__(self, errors, result_client):
        self.errors = errors
        self.result_client = result_client
        self.executions = {}

    def get_or_create_execution(self, job_id, document_id, source_sha256):
        execution = self.executions.setdefault(job_id, SimpleNamespace(
            job_id=job_id, document_id=document_id, source_sha256=source_sha256,
            status="QUEUED", attempts=0, callback_payload=None,
            delivery_status="NOT_STAGED", delivery_attempts=0, delivered_at=None,
        ))
        if (execution.document_id, execution.source_sha256) != (document_id, source_sha256):
            raise self.errors.PermanentProcessingError("Execution identity mismatch.")
        return execution

    def start_or_resume(self, job_id):
        execution = self.executions[job_id]
        if execution.callback_payload is not None:
            return None, json.loads(execution.callback_payload)
        if execution.status == "QUEUED":
            execution.attempts += 1
            execution.status = "RUNNING"
        return execution.attempts, None

    def prepare_processing_retry(self, job_id):
        self.executions[job_id].status = "QUEUED"

    def stage_terminal(self, job_id, payload):
        serialized = self.result_client.serialize_callback(payload)
        execution = self.executions[job_id]
        if execution.callback_payload is not None:
            return json.loads(execution.callback_payload)
        execution.callback_payload = serialized
        execution.status = payload["status"]
        execution.delivery_status = "PENDING"
        return payload

    def begin_delivery(self, job_id, max_attempts):
        execution = self.executions[job_id]
        should_send = execution.delivery_status == "PENDING" and execution.delivery_attempts < max_attempts
        if should_send:
            execution.delivery_attempts += 1
        return (json.loads(execution.callback_payload), execution.delivery_status,
                execution.delivery_attempts, should_send)

    def mark_delivered(self, job_id):
        execution = self.executions[job_id]
        execution.delivery_status = "DELIVERED"
        execution.delivered_at = timezone.now()

    def mark_rejected(self, job_id):
        self.executions[job_id].delivery_status = "REJECTED"


@pytest.fixture
def worker_bridge(monkeypatch, settings):
    service_path = Path(__file__).resolve().parents[3] / "services" / "document-processing"
    monkeypatch.syspath_prepend(str(service_path))
    # The backend test database must never install or create the processing
    # service's Execution table. Substitute only that worker-side boundary.
    store_module = ModuleType("processing_service.execution_store")
    monkeypatch.setitem(sys.modules, "processing_service.execution_store", store_module)
    from processing_service import errors, result_client, source_client, tasks
    store = InMemoryExecutionStore(errors, result_client)
    for name in (
        "get_or_create_execution", "start_or_resume", "prepare_processing_retry",
        "stage_terminal", "begin_delivery", "mark_delivered", "mark_rejected",
    ):
        setattr(store_module, name, getattr(store, name))
    monkeypatch.setattr(tasks, "execution_store", store_module)

    settings.PROCESSING_SERVICE_TOKEN = "integration-service-token"
    settings.PROCESSING_DJANGO_API_URL = "http://testserver"
    client = Client(enforce_csrf_checks=True)
    callbacks = []
    callback_outcomes = []
    sources = []
    state = SimpleNamespace(lose_next_terminal_response=False,
                            fail_next_terminal_before_request=False)

    def transport(request, **kwargs):
        path = urlsplit(request.full_url).path
        headers = {"HTTP_AUTHORIZATION": request.get_header("Authorization")}
        if request.get_method() == "GET":
            sources.append(path)
            response = client.get(path, **headers)
        else:
            payload = json.loads(request.data)
            if state.fail_next_terminal_before_request and payload["status"] in {"SUCCEEDED", "FAILED"}:
                state.fail_next_terminal_before_request = False
                callbacks.append((payload, 503))
                raise HTTPError(request.full_url, 503, "Simulated temporary outage", Message(), BytesIO(b""))
            response = client.post(
                path, data=request.data, content_type=request.get_header("Content-type"), **headers,
            )
            callbacks.append((payload, response.status_code))
        body = b"".join(response.streaming_content) if response.streaming else response.content
        response.close()
        if request.get_method() == "POST" and response.status_code == 200:
            callback_outcomes.append(json.loads(body)["status"])
            if state.lose_next_terminal_response and json.loads(request.data)["status"] in {"SUCCEEDED", "FAILED"}:
                state.lose_next_terminal_response = False
                raise URLError("simulated lost response after Django committed")
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
                           callbacks=callbacks, callback_outcomes=callback_outcomes,
                           sources=sources, store=store, state=state, embed=embed)


def task_receipt(payload):
    """The task returns only correlation fields; the callback carries the result."""
    return {key: payload[key] for key in ("job_id", "document_id", "attempt", "status")}


def upload_job(owner_client, course, pdf_factory, kind="text"):
    response = owner_client.post(
        f"/api/v1/courses/{course.pk}/documents/",
        {"file": SimpleUploadedFile("lecture.pdf", pdf_factory(kind), content_type="application/pdf")},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.json()["status"] == "PENDING"
    document = Document.objects.get(pk=response.json()["id"])
    job = document.jobs.get()
    assert document.status == Document.Status.PENDING
    assert job.status == Job.Status.QUEUED
    assert not document.chunks.exists()
    return document, job


@pytest.mark.django_db(transaction=True)
def test_uploaded_pdf_reaches_ready_and_identical_redelivery_is_acknowledged(
    worker_bridge, owner_client, owner, course, pdf_factory, dispatch, monkeypatch,
):
    document, job = upload_job(owner_client, course, pdf_factory)
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["status"] == "PENDING"
    dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)
    receipt = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    result = worker_bridge.callbacks[-1][0]
    assert receipt == task_receipt(result)
    assert worker_bridge.results.submit_callback(job.pk, result) == "duplicate"
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert job.attempts == 1
    assert document.status == Document.Status.READY
    assert document.page_count == 1
    chunks = list(get_ordered_chunks(document))
    assert len(chunks) == len(result["chunks"]) > 0
    assert all(chunk.owner_id == document.owner_id for chunk in chunks)
    assert [payload["status"] for payload, code in worker_bridge.callbacks if code == 200] == [
        "RUNNING", "SUCCEEDED", "SUCCEEDED",
    ]
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["status"] == "READY"

    question = "What does this lecture cover?"
    query_embed = Mock(return_value=[[0.25] * 768])
    monkeypatch.setattr("apps.knowledge.retrieval.embed_texts", query_embed)
    retrieved = retrieve_chunks(owner, document.pk, question)
    assert [row["chunk_id"] for row in retrieved] == [chunk.pk for chunk in chunks]
    assert [row["content"] for row in retrieved] == [chunk.content for chunk in chunks]

    def answer_from_passages(_, passages):
        passage = passages[0]
        return {
            "status": "ANSWERED", "answer": "The lecture contains the cited material.",
            "citations": [{
                "chunk_id": passage["chunk_id"], "document_id": passage["document_id"],
                "page_number": passage["page_number"], "excerpt": passage["content"],
            }],
        }

    pandu = SimpleNamespace(generate=Mock(side_effect=answer_from_passages))
    monkeypatch.setattr("apps.knowledge.llm.get_client", lambda: pandu)
    answer = owner_client.post(
        "/api/v1/rag/questions/", {"question": question, "document_ids": [document.pk]}, format="json",
    )
    assert answer.status_code == 200
    assert answer.json()["status"] == "ANSWERED"
    assert answer.json()["citations"][0]["chunk_id"] == chunks[0].pk
    assert pandu.generate.call_args.args[1][0]["content"] == chunks[0].content
    assert query_embed.call_count == 2

    notes_provider = FakeStudyGuideLLM()
    notes_provider.generate_notes = Mock(wraps=notes_provider.generate_notes)
    monkeypatch.setattr("apps.notes.services.get_client", lambda: notes_provider)
    notes = owner_client.post(
        f"/api/v1/courses/{course.pk}/notes/", {"document_ids": [document.pk]}, format="json",
    )
    assert notes.status_code == 201
    assert notes.json()["source_documents"] == [{"id": document.pk, "name": document.title}]
    notes_provider.generate_notes.assert_called_once_with([
        (document.title, "\n\n".join(chunk.content for chunk in chunks)),
    ], DEFAULT_NOTE_OPTIONS)
    assert owner_client.get(f"/api/v1/notes/{notes.json()['id']}/").status_code == 200


@pytest.mark.django_db(transaction=True)
def test_worker_crash_redelivery_finishes_once(
    worker_bridge, owner_client, course, pdf_factory, dispatch, monkeypatch,
):
    """A task replayed after a worker dies uses the same job and one final result."""
    from processing_service import tasks

    document, job = upload_job(owner_client, course, pdf_factory)
    original_extract = tasks.extract_document

    def crash_after_fetch(*args, **kwargs):
        raise SystemExit("worker process lost")

    with monkeypatch.context() as crashed_worker:
        crashed_worker.setattr(tasks, "extract_document", crash_after_fetch)
        with pytest.raises(SystemExit, match="worker process lost"):
            worker_bridge.task.run(job.pk, document.pk, document.sha256)

    job.refresh_from_db()
    assert job.status == Job.Status.RUNNING
    assert job.attempts == 1
    assert not document.chunks.exists()

    # Redis/Celery replays the original task with its original retry counter.
    assert tasks.extract_document is original_extract
    receipt = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    result = worker_bridge.callbacks[-1][0]
    assert receipt == task_receipt(result)
    assert result["status"] == "SUCCEEDED"
    assert worker_bridge.results.submit_callback(job.pk, result) == "duplicate"

    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert job.attempts == 1
    assert document.status == Document.Status.READY
    assert document.chunks.count() == len(result["chunks"]) > 0
    assert [payload["status"] for payload, _ in worker_bridge.callbacks] == [
        "RUNNING", "RUNNING", "SUCCEEDED", "SUCCEEDED",
    ]
    dispatch.assert_called_once_with(job.pk, document.pk, document.sha256)


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

    receipt = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    assert [payload["status"] for payload, _ in worker_bridge.callbacks] == ["RUNNING", "SUCCEEDED"]
    result = worker_bridge.callbacks[-1][0]
    assert receipt == task_receipt(result)
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
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["status"] == "FAILED"
    assert [(payload["status"], code) for payload, code in worker_bridge.callbacks] == [
        ("RUNNING", 200), ("FAILED", 200),
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
def test_cross_user_job_document_pair_cannot_process_or_expose_results(
    worker_bridge, owner_client, course, other_user, foreign_course,
    document_factory, pdf_factory, monkeypatch,
):
    document_a, job_a = upload_job(owner_client, course, pdf_factory)
    document_b = document_factory(related_course=foreign_course)
    job_b = Job.objects.create(document=document_b)
    assert document_a.owner_id != document_b.owner_id
    assert document_a.sha256 == document_b.sha256

    from processing_service import tasks

    with monkeypatch.context() as attack:
        source_fetch = Mock(side_effect=AssertionError("Rejected task must not fetch a source"))
        attack.setattr(tasks, "fetch_source_document", source_fetch)
        with pytest.raises(worker_bridge.errors.PermanentProcessingError):
            worker_bridge.task.run(job_a.pk, document_b.pk, document_a.sha256)
        source_fetch.assert_not_called()
    assert [(payload["status"], code) for payload, code in worker_bridge.callbacks] == [
        ("RUNNING", 409),
    ]
    worker_bridge.embed.assert_not_called()
    job_a.refresh_from_db()
    job_b.refresh_from_db()
    document_a.refresh_from_db()
    document_b.refresh_from_db()
    assert (job_a.status, job_b.status) == (Job.Status.QUEUED, Job.Status.QUEUED)
    assert (document_a.status, document_b.status) == (Document.Status.PENDING, Document.Status.PENDING)
    assert not Chunk.objects.exists()

    receipt_b = worker_bridge.task.run(job_b.pk, document_b.pk, document_b.sha256)
    result_b = worker_bridge.callbacks[-1][0]
    assert receipt_b == task_receipt(result_b)
    with pytest.raises(worker_bridge.errors.PermanentProcessingError):
        worker_bridge.results.submit_callback(job_a.pk, {**result_b, "job_id": job_a.pk})
    assert worker_bridge.callbacks[-1][0]["status"] == "SUCCEEDED"
    assert worker_bridge.callbacks[-1][1] == 409

    job_a.refresh_from_db()
    document_a.refresh_from_db()
    document_b.refresh_from_db()
    assert job_a.status == Job.Status.QUEUED
    assert document_a.status == Document.Status.PENDING
    assert document_b.status == Document.Status.READY
    assert not document_a.chunks.exists()
    chunks_b = list(document_b.chunks.all())
    assert chunks_b
    assert all(chunk.owner_id == other_user.pk and chunk.document_id == document_b.pk for chunk in chunks_b)

    student_b_client = APIClient()
    student_b_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
    document_url = f"/api/v1/documents/{document_b.pk}/"
    assert owner_client.get(document_url).status_code == 404
    assert student_b_client.get(document_url).json()["status"] == "READY"

    query = {"question": "What is in the lecture?", "document_ids": [document_b.pk]}
    query_embedding = Mock(return_value=[[0.25] * 768])
    monkeypatch.setattr("apps.knowledge.retrieval.embed_texts", query_embedding)
    assert owner_client.post("/api/v1/rag/questions/", query, format="json").status_code == 404
    assert student_b_client.post("/api/v1/rag/questions/", query, format="json").status_code == 200
    query_embedding.assert_called_once()


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
    # The staging size check rejects the oversized result before it reaches the network.
    assert [(payload["status"], code) for payload, code in worker_bridge.callbacks] == [
        ("RUNNING", 200), ("FAILED", 200),
    ]
    retry.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_persistence_outage_allows_original_callback_to_be_redelivered(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    from celery.exceptions import Retry
    from processing_service import tasks

    document, job = upload_job(owner_client, course, pdf_factory)
    extract = Mock(wraps=tasks.extract_document)
    chunk = Mock(wraps=tasks.chunk_pages)
    monkeypatch.setattr(tasks, "extract_document", extract)
    monkeypatch.setattr(tasks, "chunk_pages", chunk)
    retry = Mock(side_effect=Retry())
    monkeypatch.setattr(worker_bridge.task, "retry", retry)
    with monkeypatch.context() as failure:
        failure.setattr(Chunk.objects, "bulk_create", Mock(side_effect=DatabaseError("offline")))
        with pytest.raises(Retry):
            worker_bridge.task.run(job.pk, document.pk, document.sha256)
    payload, code = worker_bridge.callbacks[-1]
    assert code == 503
    assert payload["status"] == "SUCCEEDED"
    execution = worker_bridge.store.executions[job.pk]
    assert execution.status == "SUCCEEDED"
    assert execution.delivery_status == "PENDING"
    assert json.loads(execution.callback_payload) == payload
    assert execution.attempts == execution.delivery_attempts == 1
    job.refresh_from_db()
    assert job.status == Job.Status.RUNNING
    assert job.terminal_callback_sha256 == ""
    assert not document.chunks.exists()

    receipt = worker_bridge.task.run(job.pk, document.pk, document.sha256)
    assert receipt == task_receipt(payload)
    assert worker_bridge.callbacks[-1] == (payload, 200)
    assert worker_bridge.callback_outcomes[-1] == "applied"
    assert execution.delivery_status == "DELIVERED"
    assert execution.delivered_at is not None
    assert execution.attempts == 1
    assert execution.delivery_attempts == 2
    assert len(worker_bridge.sources) == 1
    extract.assert_called_once()
    chunk.assert_called_once()
    worker_bridge.embed.assert_called_once()
    assert worker_bridge.results.submit_callback(job.pk, payload) == "duplicate"
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert document.status == Document.Status.READY
    assert document.chunks.count() == len(payload["chunks"])
    assert job.attempts == payload["attempt"] == 1


@pytest.mark.django_db(transaction=True)
def test_lost_response_after_commit_replays_exact_result_as_duplicate(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    from celery.exceptions import Retry
    from processing_service import tasks

    document, job = upload_job(owner_client, course, pdf_factory)
    extract = Mock(wraps=tasks.extract_document)
    chunk = Mock(wraps=tasks.chunk_pages)
    monkeypatch.setattr(tasks, "extract_document", extract)
    monkeypatch.setattr(tasks, "chunk_pages", chunk)
    monkeypatch.setattr(worker_bridge.task, "retry", Mock(side_effect=Retry()))
    worker_bridge.state.lose_next_terminal_response = True

    with pytest.raises(Retry):
        worker_bridge.task.run(job.pk, document.pk, document.sha256)
    execution = worker_bridge.store.executions[job.pk]
    saved = json.loads(execution.callback_payload)
    assert execution.status == "SUCCEEDED"
    assert execution.delivery_status == "PENDING"
    assert worker_bridge.callback_outcomes == ["applied", "applied"]
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert document.status == Document.Status.READY
    first_chunk_ids = list(document.chunks.order_by("pk").values_list("pk", flat=True))
    assert len(first_chunk_ids) == len(saved["chunks"]) > 0

    assert worker_bridge.task.run(job.pk, document.pk, document.sha256) == task_receipt(saved)
    assert worker_bridge.callbacks[-1] == (saved, 200)
    assert worker_bridge.callback_outcomes[-1] == "duplicate"
    assert execution.delivery_status == "DELIVERED"
    assert execution.delivered_at is not None
    assert execution.attempts == 1
    assert execution.delivery_attempts == 2
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.SUCCEEDED
    assert document.status == Document.Status.READY
    assert list(document.chunks.order_by("pk").values_list("pk", flat=True)) == first_chunk_ids
    assert len(worker_bridge.sources) == 1
    extract.assert_called_once()
    chunk.assert_called_once()
    worker_bridge.embed.assert_called_once()


@pytest.mark.django_db(transaction=True)
def test_failed_result_survives_temporary_callback_outage(
    worker_bridge, owner_client, course, pdf_factory, monkeypatch,
):
    from celery.exceptions import Retry
    from processing_service import tasks

    document, job = upload_job(owner_client, course, pdf_factory, "scanned")
    extract = Mock(wraps=tasks.extract_document)
    chunk = Mock(wraps=tasks.chunk_pages)
    monkeypatch.setattr(tasks, "extract_document", extract)
    monkeypatch.setattr(tasks, "chunk_pages", chunk)
    monkeypatch.setattr(worker_bridge.task, "retry", Mock(side_effect=Retry()))
    worker_bridge.state.fail_next_terminal_before_request = True

    with pytest.raises(Retry):
        worker_bridge.task.run(job.pk, document.pk, document.sha256)
    execution = worker_bridge.store.executions[job.pk]
    saved = json.loads(execution.callback_payload)
    assert saved["status"] == execution.status == "FAILED"
    assert saved["error_code"] == "PROCESSING_FAILED"
    assert execution.delivery_status == "PENDING"
    job.refresh_from_db()
    assert job.status == Job.Status.RUNNING

    assert worker_bridge.task.run(job.pk, document.pk, document.sha256) == task_receipt(saved)
    assert worker_bridge.callbacks[-1] == (saved, 200)
    assert execution.delivery_status == "DELIVERED"
    assert execution.delivered_at is not None
    assert execution.attempts == 1
    assert execution.delivery_attempts == 2
    job.refresh_from_db()
    document.refresh_from_db()
    assert job.status == Job.Status.FAILED
    assert document.status == Document.Status.FAILED
    assert not document.chunks.exists()
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").json()["error"] == {
        "code": "PROCESSING_FAILED", "message": "This document could not be processed.",
    }
    assert len(worker_bridge.sources) == 1
    extract.assert_called_once()
    chunk.assert_called_once()
    worker_bridge.embed.assert_not_called()
