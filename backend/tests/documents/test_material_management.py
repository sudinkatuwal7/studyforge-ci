"""Public material APIs retain the existing ownership and representation contract."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.documents.models import Document, Job
from apps.knowledge.models import Chunk
from apps.notes.models import StudyGuide

pytestmark = pytest.mark.django_db


def detail(document):
    return f"/api/v1/documents/{document.pk}/"


def test_list_owner_status_order_and_representation(owner_client, course, foreign_course, document_factory):
    documents = [document_factory(status=status) for status in Document.Status.values]
    # Deliberately make creation order differ from IDs.
    Document.objects.filter(pk=documents[0].pk).update(created_at=timezone.now() + timedelta(days=1))
    document_factory(related_course=foreign_course)
    response = owner_client.get(f"/api/v1/courses/{course.pk}/documents/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert [row["id"] for row in response.json()] == [documents[0].pk, *[doc.pk for doc in documents[:0:-1]]]
    assert {row["status"] for row in response.json()} == set(Document.Status.values)
    for row in response.json():
        assert set(row) == {"id", "course_id", "name", "status", "created_at", "updated_at", "error"}
        assert row["course_id"] == course.pk


def test_empty_list(owner_client, course):
    assert owner_client.get(f"/api/v1/courses/{course.pk}/documents/").json() == []


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_detail_authentication_required(document_factory, method, assert_error):
    document = document_factory()
    response = getattr(APIClient(), method)(detail(document))
    assert_error(response, 401, "AUTHENTICATION_REQUIRED")
    assert Document.objects.filter(pk=document.pk).exists()


def test_list_authentication_and_private_404(owner_client, course, foreign_course, assert_error):
    assert_error(APIClient().get(f"/api/v1/courses/{course.pk}/documents/"), 401, "AUTHENTICATION_REQUIRED")
    for course_id in [foreign_course.pk, 999999, "invalid", "0"]:
        assert_error(owner_client.get(f"/api/v1/courses/{course_id}/documents/"), 404, "RESOURCE_NOT_FOUND")


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_foreign_and_missing_document_private_404(owner_client, foreign_course, document_factory, method, assert_error):
    foreign = document_factory(related_course=foreign_course)
    for document_id in [foreign.pk, 999999, "invalid", "0"]:
        response = getattr(owner_client, method)(f"/api/v1/documents/{document_id}/", {"name": "Changed"}, format="json")
        assert_error(response, 404, "RESOURCE_NOT_FOUND")
    foreign.refresh_from_db()
    assert foreign.title == "lecture.pdf"
    assert foreign.file.storage.exists(foreign.file.name)


@pytest.mark.parametrize("data,code", [
    ({"name": ""}, "INVALID_NAME"), ({"name": "  \t "}, "INVALID_NAME"),
    ({"name": None}, "INVALID_NAME"), ({"name": 42}, "INVALID_NAME"),
    ({"name": True}, "INVALID_NAME"), ({"name": []}, "INVALID_NAME"),
    ({"name": "a" * 256}, "INVALID_NAME"), ({"name": "bad\x00name"}, "INVALID_NAME"),
    ({"name": "bad\nname"}, "INVALID_NAME"), ({}, "INVALID_MATERIAL_UPDATE"),
    ({"title": "name"}, "INVALID_MATERIAL_UPDATE"),
    ({"name": "name", "status": "READY"}, "INVALID_MATERIAL_UPDATE"),
    ({"name": "name", "course_id": 12}, "INVALID_MATERIAL_UPDATE"),
    ([], "INVALID_MATERIAL_UPDATE"),
])
def test_invalid_rename(owner_client, document_factory, data, code, assert_error):
    document = document_factory()
    before = Document.objects.values().get(pk=document.pk)
    assert_error(owner_client.patch(detail(document), data, format="json"), 400, code)
    assert Document.objects.values().get(pk=document.pk) == before


@pytest.mark.parametrize("status", Document.Status.values)
def test_rename_preserves_everything_except_title_and_timestamp(owner_client, document_factory, status):
    document = document_factory(status=status)
    Job.objects.create(document=document, status="FAILED", attempts=3, terminal_callback_sha256="a" * 64)
    Chunk.objects.create(document=document, owner=document.owner, page_number=1, content="Lecture", embedding=[0.5] * 768)
    StudyGuide.objects.create(document=document, summary="Keep these notes")
    before = Document.objects.values().get(pk=document.pk)
    job = list(Job.objects.values())
    guide = list(StudyGuide.objects.values())
    chunk = Chunk.objects.get(document=document)
    source = document.file.read()
    document.file.close()
    response = owner_client.patch(detail(document), {"name": "  Renamed lecture  "}, format="json")
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed lecture"
    assert response.json()["status"] == status
    after = Document.objects.values().get(pk=document.pk)
    assert after.pop("title") == "Renamed lecture"
    assert after.pop("updated_at") >= before.pop("updated_at")
    before.pop("title")
    assert after == before
    assert list(Job.objects.values()) == job
    assert list(StudyGuide.objects.values()) == guide
    chunk.refresh_from_db()
    assert chunk.content == "Lecture"
    assert list(chunk.embedding) == [0.5] * 768
    document.refresh_from_db()
    assert document.file.read() == source
    document.file.close()


def test_rename_maximum_length(owner_client, document_factory):
    response = owner_client.patch(detail(document_factory()), {"name": "a" * 255}, format="json")
    assert response.status_code == 200
    assert response.json()["name"] == "a" * 255


@pytest.mark.parametrize("body,content_type", [("{", "application/json"), ("name=Changed", "text/plain")])
def test_malformed_rename_is_safe_and_ownership_is_checked_first(owner_client, document_factory, foreign_course, body, content_type, assert_error):
    own, foreign = document_factory(), document_factory(related_course=foreign_course)
    assert_error(owner_client.patch(detail(own), body, content_type=content_type), 400, "INVALID_MATERIAL_UPDATE")
    assert_error(owner_client.patch(detail(foreign), body, content_type=content_type), 404, "RESOURCE_NOT_FOUND")
    own.refresh_from_db()
    assert own.title == "lecture.pdf"
