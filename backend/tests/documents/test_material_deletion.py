"""Real PostgreSQL cascades, storage failure rollback, and callback serialization."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import Mock

import pytest
from django.db import DatabaseError, close_old_connections, connection
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.courses.models import Course
from apps.documents.models import Document, Job
from apps.knowledge.models import Chunk
from apps.notes.models import StudyGuide
from apps.quizzes.models import Question, Quiz

pytestmark = pytest.mark.django_db(transaction=True)


def related(document):
    job = Job.objects.create(document=document)
    chunk = Chunk.objects.create(document=document, owner=document.owner, page_number=1, content="Lecture", embedding=[0.5] * 768)
    guide = StudyGuide.objects.create(document=document, summary="Summary")
    quiz = Quiz.objects.create(course=document.course, owner=document.owner, title="Keep quiz")
    quiz.source_documents.add(document)
    question = Question.objects.create(quiz=quiz, position=1, text="Question?", options=["A", "B"], correct_option_index=0)
    return job, chunk, guide, quiz, question


def success(job, document):
    return {
        "schema_version": 1, "job_id": job.pk, "document_id": document.pk,
        "source_sha256": document.sha256, "attempt": 1, "status": "SUCCEEDED",
        "page_count": 1, "likely_scanned": False,
        "chunks": [{"page_number": 1, "content": "Lecture", "embedding": [0.25] * 768}],
    }


def test_delete_cascades_preserves_quizzes_and_unrelated_data(owner_client, document_factory, owner):
    document, other = document_factory(), document_factory()
    job, chunk, guide, quiz, question = related(document)
    other_job, other_chunk, other_guide, other_quiz, other_question = related(other)
    quiz.source_documents.add(other)
    document_id, source, storage = document.pk, document.file.name, document.file.storage
    response = owner_client.delete(f"/api/v1/documents/{document_id}/")
    assert response.status_code == 204 and response.content == b""
    assert not Document.objects.filter(pk=document_id).exists()
    for obj in [job, chunk, guide]:
        assert not type(obj).objects.filter(pk=obj.pk).exists()
    assert list(quiz.source_documents.values_list("pk", flat=True)) == [other.pk]
    for obj in [quiz, question, other, other_job, other_chunk, other_guide, other_quiz, other_question, owner]:
        assert type(obj).objects.filter(pk=obj.pk).exists()
    assert Course.objects.filter(pk=document.course_id).exists()
    assert not storage.exists(source)
    assert other.file.storage.exists(other.file.name)
    assert owner_client.delete(f"/api/v1/documents/{document_id}/").status_code == 404


def test_missing_source_is_already_removed(owner_client, document_factory):
    document = document_factory()
    document.file.storage.delete(document.file.name)
    assert owner_client.delete(f"/api/v1/documents/{document.pk}/").status_code == 204
    assert not Document.objects.exists()


def test_storage_failure_rolls_back_all_cascades(owner_client, document_factory, monkeypatch, assert_error):
    document = document_factory()
    children = related(document)
    source = document.file.name
    monkeypatch.setattr(document.file.storage, "delete", Mock(side_effect=OSError("private storage path")))
    response = owner_client.delete(f"/api/v1/documents/{document.pk}/")
    assert_error(response, 503, "MATERIAL_UNAVAILABLE")
    assert "private storage" not in response.content.decode()
    for obj in [document, *children]:
        assert type(obj).objects.filter(pk=obj.pk).exists()
    assert children[3].source_documents.filter(pk=document.pk).exists()
    assert document.file.storage.exists(source)


def test_database_delete_failure_does_not_touch_source(owner_client, document_factory, monkeypatch, assert_error):
    document = document_factory()
    children = related(document)
    real_delete = Document.delete

    def fail_after_sql(self, *args, **kwargs):
        real_delete(self, *args, **kwargs)
        raise DatabaseError("forced SQL failure")

    monkeypatch.setattr(Document, "delete", fail_after_sql)
    assert_error(owner_client.delete(f"/api/v1/documents/{document.pk}/"), 503, "MATERIAL_UNAVAILABLE")
    for obj in [document, *children]:
        assert type(obj).objects.filter(pk=obj.pk).exists()
    assert document.file.storage.exists(document.file.name)


def test_commit_failure_reports_error_and_documents_missing_file_limit(owner_client, document_factory, monkeypatch, assert_error):
    document = document_factory()
    children = related(document)
    with monkeypatch.context() as patch:
        patch.setattr(connection, "commit", Mock(side_effect=DatabaseError("commit failed")))
        assert_error(owner_client.delete(f"/api/v1/documents/{document.pk}/"), 503, "MATERIAL_UNAVAILABLE")
    # The database rolls back, but filesystem deletion is irreversible.
    for obj in [document, *children]:
        assert type(obj).objects.filter(pk=obj.pk).exists()
    assert not document.file.storage.exists(document.file.name)
    assert owner_client.delete(f"/api/v1/documents/{document.pk}/").status_code == 204


@pytest.mark.parametrize("attempt", [1, 2])
def test_late_callback_and_retrieval_fail_safely(owner_client, document_factory, settings, attempt):
    settings.PROCESSING_SERVICE_TOKEN = "deletion-test-token"
    document = document_factory()
    job = Job.objects.create(document=document, attempts=2)
    payload = {**success(job, document), "attempt": attempt}
    assert owner_client.delete(f"/api/v1/documents/{document.pk}/").status_code == 204
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer deletion-test-token")
    assert client.post(f"/internal/v1/jobs/{job.pk}/result/", payload, format="json").status_code == 404
    assert client.get(f"/internal/v1/jobs/{job.pk}/document/").status_code == 404
    assert not Document.objects.exists() and not Job.objects.exists() and not Chunk.objects.exists()


@pytest.mark.parametrize("first", ["callback", "delete"])
def test_callback_delete_race_serializes_on_document(document_factory, owner, settings, first):
    settings.PROCESSING_SERVICE_TOKEN = "deletion-test-token"
    document = document_factory()
    job = Job.objects.create(document=document)
    payload = success(job, document)
    token = str(AccessToken.for_user(owner))
    locked, contender = Event(), Event()

    def run(action):
        close_old_connections()

        def observe(execute, sql, params, many, context):
            document_lock = '"documents_document"' in sql and "FOR UPDATE" in sql
            if document_lock and action != first:
                contender.set()
            result = execute(sql, params, many, context)
            if document_lock and action == first:
                locked.set()
                assert contender.wait(10), "The competing request did not reach the document lock"
            return result

        try:
            with connection.execute_wrapper(observe):
                client = APIClient()
                if action == "delete":
                    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
                    return client.delete(f"/api/v1/documents/{document.pk}/").status_code
                client.credentials(HTTP_AUTHORIZATION="Bearer deletion-test-token")
                return client.post(f"/internal/v1/jobs/{job.pk}/result/", payload, format="json").status_code
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first_result = pool.submit(run, first)
        assert locked.wait(10), "The first request did not lock the document"
        second = "delete" if first == "callback" else "callback"
        second_result = pool.submit(run, second)
        results = {first: first_result.result(timeout=15), second: second_result.result(timeout=15)}
    assert results == {"delete": 204, "callback": 200 if first == "callback" else 404}
    assert not Document.objects.exists() and not Job.objects.exists() and not Chunk.objects.exists()
    assert not document.file.storage.exists(document.file.name)
