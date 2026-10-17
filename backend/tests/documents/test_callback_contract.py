"""Callback boundaries and concurrent requests against PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from threading import Barrier

import pytest
from django.db import close_old_connections
from django.test import Client, RequestFactory

from apps.documents.internal_views import InternalJobResultView
from apps.documents.models import Document, Job
from apps.documents.result_callbacks import MAX_CALLBACK_BYTES
from apps.knowledge.models import Chunk


@pytest.fixture
def callback_job(course, settings):
    settings.PROCESSING_SERVICE_TOKEN = "contract-test-token"
    document = Document.objects.create(
        owner=course.owner, course=course, title="Contract", sha256="a" * 64,
        file="documents/contract.pdf",
    )
    return Job.objects.create(document=document)


def success(job):
    return {
        "schema_version": 1, "job_id": job.pk, "document_id": job.document_id,
        "source_sha256": "a" * 64, "attempt": 1, "status": "SUCCEEDED",
        "page_count": 1, "likely_scanned": False,
        "chunks": [{"page_number": 1, "content": "Lecture", "embedding": [0.25] * 768}],
    }


def post(job_id, payload):
    return Client(enforce_csrf_checks=True).post(
        f"/internal/v1/jobs/{job_id}/result/", data=json.dumps(payload),
        content_type="application/json", HTTP_AUTHORIZATION="Bearer contract-test-token",
    )


@pytest.mark.django_db
@pytest.mark.parametrize("field,value", [
    ("schema_version", True), ("schema_version", 2), ("attempt", True),
    ("attempt", 0), ("attempt", -1), ("attempt", 1.5), ("attempt", "1"),
    ("job_id", True), ("job_id", 0), ("document_id", True),
    ("source_sha256", "A" * 64), ("status", []), ("page_count", True),
    ("page_count", 0), ("likely_scanned", 1), ("chunks", {}), ("owner_id", 1),
])
def test_invalid_envelope_does_not_mutate(callback_job, field, value):
    payload = {**success(callback_job), field: value}
    assert post(callback_job.pk, payload).status_code == 400
    callback_job.refresh_from_db()
    assert callback_job.status == Job.Status.QUEUED
    assert callback_job.attempts == 0
    assert not Chunk.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("field,value", [
    ("content", "  \n"), ("page_number", True), ("page_number", 0),
    ("page_number", 2), ("embedding", [0.0] * 767),
    ("embedding", [True] + [0.0] * 767),
    ("embedding", [float("inf")] + [0.0] * 767),
])
def test_invalid_later_chunk_rejects_entire_result(callback_job, field, value):
    payload = success(callback_job)
    payload["chunks"].append({**deepcopy(payload["chunks"][0]), field: value})
    assert post(callback_job.pk, payload).status_code == 400
    assert not Chunk.objects.exists()


@pytest.mark.django_db
def test_canonical_receipt_accepts_reordered_json_keys(callback_job):
    payload = success(callback_job)
    assert post(callback_job.pk, payload).json() == {"status": "applied"}
    reordered = dict(reversed(list(payload.items())))
    reordered["chunks"] = [dict(reversed(list(payload["chunks"][0].items())))]
    assert post(callback_job.pk, reordered).json() == {"status": "duplicate"}


@pytest.mark.django_db
def test_chunk_order_is_preserved_and_reordering_is_a_conflict(callback_job):
    from apps.notes.selectors import get_ordered_chunks

    payload = success(callback_job)
    payload["chunks"].append({**deepcopy(payload["chunks"][0]), "content": "Second chunk"})
    assert post(callback_job.pk, payload).status_code == 200
    assert list(get_ordered_chunks(callback_job.document).values_list("content", flat=True)) == [
        "Lecture", "Second chunk",
    ]
    payload["chunks"].reverse()
    assert post(callback_job.pk, payload).status_code == 409


@pytest.mark.django_db
def test_older_job_cannot_overwrite_newer_persisted_result(callback_job):
    newer = Job.objects.create(document=callback_job.document)
    payload = success(newer)
    payload["chunks"][0]["content"] = "Current result"
    assert post(newer.pk, payload).status_code == 200
    response = post(callback_job.pk, success(callback_job))
    assert response.status_code == 409
    assert response.json() == {"error": "stale_job"}
    assert Chunk.objects.get(document=callback_job.document).content == "Current result"
    callback_job.refresh_from_db()
    assert callback_job.status == Job.Status.QUEUED


@pytest.mark.django_db
@pytest.mark.parametrize("route", ["document", "result"])
def test_user_jwt_cannot_replace_service_credentials(callback_job, owner_client, route):
    method = owner_client.get if route == "document" else owner_client.post
    assert method(f"/internal/v1/jobs/{callback_job.pk}/{route}/").status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("extra,expected", [(0, 200), (1, 413)])
def test_callback_byte_limit_inclusive(callback_job, extra, expected):
    payload = success(callback_job)
    body = json.dumps(payload).encode()
    body += b" " * (MAX_CALLBACK_BYTES + extra - len(body))
    response = Client().post(
        f"/internal/v1/jobs/{callback_job.pk}/result/", data=body,
        content_type="application/json", HTTP_AUTHORIZATION="Bearer contract-test-token",
    )
    assert response.status_code == expected


@pytest.mark.django_db
def test_actual_body_limit_is_enforced_without_content_length(callback_job):
    request = RequestFactory().post(
        "/", data=b" " * (MAX_CALLBACK_BYTES + 1), content_type="application/json",
        HTTP_AUTHORIZATION="Bearer contract-test-token",
    )
    # Cache the actual body before removing the header; some WSGI servers need
    # CONTENT_LENGTH to read a stream, but validation must also check the bytes.
    request.body
    request.META.pop("CONTENT_LENGTH")
    response = InternalJobResultView.as_view()(request, job_id=callback_job.pk)
    assert response.status_code == 413


@pytest.mark.django_db
@pytest.mark.parametrize("route", ["document", "result"])
@pytest.mark.parametrize("token", ["Bearer wrong", "Basic contract-test-token", "Bearer é", "Bearer"])
def test_shared_auth_rejects_invalid_credentials(callback_job, route, token):
    client = Client(enforce_csrf_checks=True)
    method = client.get if route == "document" else client.post
    response = method(
        f"/internal/v1/jobs/{callback_job.pk}/{route}/", HTTP_AUTHORIZATION=token,
    )
    assert response.status_code == 401


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("conflicting", [False, True])
def test_concurrent_terminal_callbacks_commit_once(callback_job, conflicting):
    first = success(callback_job)
    second = deepcopy(first)
    if conflicting:
        second["chunks"][0]["content"] = "Different result"
    barrier = Barrier(2)
    job_id = callback_job.pk

    def deliver(payload):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            response = post(job_id, payload)
            return response.status_code, response.json()
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(deliver, payload) for payload in (first, second)]
        responses = [future.result(timeout=20) for future in futures]
    if conflicting:
        assert sorted(code for code, _ in responses) == [200, 409]
        assert (409, {"error": "terminal_conflict"}) in responses
    else:
        assert sorted(body["status"] for _, body in responses) == ["applied", "duplicate"]
    assert Chunk.objects.filter(document_id=callback_job.document_id).count() == 1
    callback_job.refresh_from_db()
    assert callback_job.status == Job.Status.SUCCEEDED
    assert callback_job.attempts == 1
    assert callback_job.terminal_callback_sha256
