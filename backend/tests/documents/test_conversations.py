"""SCRUM-76: conversation ownership, document isolation, and storage cleanup."""

from unittest.mock import patch

import pytest
from django.core.files.base import ContentFile
from django.http import Http404
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.conversations.models import Conversation
from apps.documents.models import Document
from apps.documents.selectors import get_owned_course_documents
from apps.knowledge.scope import question_documents
from apps.knowledge.services import _authorized_document_ids
from apps.notes.selectors import get_owned_document

pytestmark = pytest.mark.django_db(transaction=True)


def test_owner_and_course_are_both_required(owner_client, owner, other_user, course, foreign_course):
    standalone = owner_client.post("/api/v1/conversations/", {"title": "Private"}, format="json")
    scoped = owner_client.post("/api/v1/conversations/", {"course_id": course.pk}, format="json")
    assert standalone.status_code == scoped.status_code == 201
    assert standalone.json()["course_id"] is None
    assert scoped.json()["course_id"] == course.pk
    assert owner_client.post("/api/v1/conversations/", {"course_id": foreign_course.pk},
                             format="json").status_code == 404
    assert [row["id"] for row in owner_client.get("/api/v1/conversations/").json()] == [
        scoped.json()["id"], standalone.json()["id"]
    ]
    foreign = Conversation.objects.create(owner=other_user, course=foreign_course)
    denied = APIClient()
    denied.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
    path = f"/api/v1/conversations/{scoped.json()['id']}/"
    missing = "/api/v1/conversations/9223372036854775807/"
    assert denied.get(path).status_code == denied.get(missing).status_code == 404
    assert denied.get(path).json() == denied.get(missing).json()
    assert denied.delete(path).status_code == 404
    assert owner_client.get(f"/api/v1/conversations/{foreign.pk}/").status_code == 404


def test_chat_upload_is_scoped_and_excluded_from_course_features(
    owner_client, owner, course, uploaded_pdf
):
    conversation = Conversation.objects.create(owner=owner, course=course)
    path = f"/api/v1/conversations/{conversation.pk}/documents/"
    response = owner_client.post(path, {"file": uploaded_pdf()}, format="multipart")
    assert response.status_code == 201, response.content
    document = Document.objects.get(pk=response.json()["id"])
    assert document.course_id is None and document.conversation_id == conversation.pk
    assert document.owner_id == owner.pk
    assert response.json()["conversation_id"] == conversation.pk
    assert owner_client.get(path).json()[0]["id"] == document.pk
    assert owner_client.get(f"/api/v1/courses/{course.pk}/documents/").json() == []
    assert owner_client.get(f"/api/v1/documents/{document.pk}/").status_code == 404
    with pytest.raises(Http404):
        get_owned_document(owner, document.pk)
    with pytest.raises(Http404):
        get_owned_course_documents(owner, course, [document.pk])
    with pytest.raises(Http404):
        _authorized_document_ids(owner, [document.pk])
    assert list(question_documents(owner, conversation).values_list("pk", flat=True)) == [document.pk]
    assert owner_client.get(f"/api/v1/conversations/{conversation.pk}/documents/{document.pk}/").status_code == 200
    other = Conversation.objects.create(owner=owner, course=course)
    assert owner_client.get(f"/api/v1/conversations/{other.pk}/documents/{document.pk}/").status_code == 404


def test_course_cascade_removes_conversations_uploads_and_files(owner, course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    standalone = Conversation.objects.create(owner=owner)
    chat = Document(owner=owner, conversation=conversation, title="Chat", sha256="a" * 64)
    chat.file.save("chat.pdf", ContentFile(b"chat"))
    separate = Document(owner=owner, conversation=standalone, title="Separate", sha256="b" * 64)
    separate.file.save("other.pdf", ContentFile(b"other"))
    chat_storage, chat_name = chat.file.storage, chat.file.name
    other_name = separate.file.name
    course.delete()
    assert not Conversation.objects.filter(pk=conversation.pk).exists()
    assert not Document.objects.filter(pk=chat.pk).exists()
    assert not chat_storage.exists(chat_name)
    assert Conversation.objects.filter(pk=standalone.pk).exists()
    assert chat_storage.exists(other_name)


def test_storage_failure_rolls_back_conversation_cascade(owner, course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    upload = Document(owner=owner, conversation=conversation, title="Chat", sha256="a" * 64)
    upload.file.save("chat.pdf", ContentFile(b"chat"))
    with patch.object(upload.file.storage, "delete", side_effect=OSError("storage failed")):
        with pytest.raises(OSError):
            course.delete()
    assert Conversation.objects.filter(pk=conversation.pk).exists()
    assert Document.objects.filter(pk=upload.pk).exists()
    assert upload.file.storage.exists(upload.file.name)


def test_question_endpoint_checks_conversation_before_calling_rag(owner_client, owner, course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    with patch("apps.conversations.views.answer_question", return_value={
        "status": "INSUFFICIENT_CONTEXT", "answer": None, "citations": []
    }) as answer:
        response = owner_client.post(
            f"/api/v1/conversations/{conversation.pk}/questions/",
            {"question": "Explain", "document_ids": [1]}, format="json",
        )
        assert response.status_code == 200
        assert answer.call_args.kwargs["conversation"].pk == conversation.pk
        assert owner_client.post("/api/v1/conversations/9223372036854775807/questions/",
                                 {"question": "Explain", "document_ids": [1]},
                                 format="json").status_code == 404
        assert answer.call_count == 1


def test_question_selection_stays_within_conversation_and_its_course(owner, course):
    first = Conversation.objects.create(owner=owner, course=course)
    second = Conversation.objects.create(owner=owner, course=course)
    standalone = Conversation.objects.create(owner=owner)
    chat = Document.objects.create(owner=owner, conversation=first, title="Chat",
                                   sha256="a" * 64, file="chat.pdf", status=Document.Status.READY)
    material = Document.objects.create(owner=owner, course=course, title="Material",
                                       sha256="b" * 64, file="material.pdf",
                                       status=Document.Status.READY)
    assert _authorized_document_ids(owner, [chat.pk, material.pk], first) == [chat.pk, material.pk]
    for selected, scope in [(chat.pk, second), (chat.pk, None), (material.pk, standalone)]:
        with pytest.raises(Http404):
            _authorized_document_ids(owner, [selected], scope)


def test_every_conversation_route_hides_foreign_and_missing_ids(
    owner, other_user, course
):
    conversation = Conversation.objects.create(owner=owner, course=course)
    foreign_client = APIClient()
    foreign_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
    for suffix, method, data in [
        ("/", "get", None), ("/", "delete", None),
        ("/documents/", "get", None), ("/documents/", "post", {}),
        ("/documents/1/", "get", None), ("/documents/1/", "delete", None),
        ("/questions/", "post", {}),
    ]:
        foreign_url = f"/api/v1/conversations/{conversation.pk}{suffix}"
        missing_url = f"/api/v1/conversations/9223372036854775807{suffix}"
        response = getattr(foreign_client, method)(foreign_url, data=data, format="json")
        missing = getattr(foreign_client, method)(missing_url, data=data, format="json")
        assert response.status_code == missing.status_code == 404
        assert response.json() == missing.json() == {
            "code": "RESOURCE_NOT_FOUND", "message": "Resource not found."
        }


def test_course_access_revocation_hides_owned_conversation(
    owner_client, owner, other_user, course
):
    conversation = Conversation.objects.create(owner=owner, course=course)
    course.owner = other_user
    course.save(update_fields=["owner"])
    assert owner_client.get(f"/api/v1/conversations/{conversation.pk}/").status_code == 404
    assert owner_client.get("/api/v1/conversations/").json() == []
    other_client = APIClient()
    other_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
    assert other_client.get(f"/api/v1/conversations/{conversation.pk}/").status_code == 404
