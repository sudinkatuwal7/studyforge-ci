"""SCRUM-24: opening a cited source (file endpoint) and citation source details."""

from unittest.mock import patch

import pytest
from django.core.files.base import ContentFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.conversations.models import Conversation
from apps.documents.models import Document

pytestmark = pytest.mark.django_db(transaction=True)

NOT_FOUND = {"code": "RESOURCE_NOT_FOUND", "message": "Resource not found."}
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def make(owner, *, course=None, conversation=None, title="Lecture 3", suffix=".pdf",
         data=b"%PDF-1.4 lecture bytes"):
    document = Document(owner=owner, course=course, conversation=conversation, title=title,
                        sha256="a" * 64, status=Document.Status.READY)
    document.file.save(f"stored{suffix}", ContentFile(data))
    return document


def get_file(client, document_id):
    response = client.get(f"/api/v1/documents/{document_id}/file/")
    if response.streaming:
        # Reading to the end makes the test client close the file at once. Otherwise
        # a failing assertion leaves it open, and Windows cannot delete the temp media.
        response.body = b"".join(response.streaming_content)
    return response


def body_bytes(response):
    return response.body


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


# --- GET /documents/{id}/file/ -------------------------------------------------------

def test_pdf_opens_inline_with_its_name_and_exact_bytes(owner_client, owner, course):
    material = make(owner, course=course)
    response = get_file(owner_client, material.pk)
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'inline; filename="Lecture 3.pdf"'
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Cache-Control"] == "no-store"
    assert body_bytes(response) == b"%PDF-1.4 lecture bytes"


@pytest.mark.parametrize("suffix, content_type, title, filename", [
    (".pptx", PPTX, "Week 2 slides", "Week 2 slides.pptx"),
    (".docx", DOCX, "Reading.docx", "Reading.docx"),  # extension not doubled
])
def test_slides_and_documents_download(owner_client, owner, course, suffix, content_type,
                                       title, filename):
    material = make(owner, course=course, title=title, suffix=suffix, data=b"office bytes")
    response = get_file(owner_client, material.pk)
    assert response.status_code == 200
    assert response["Content-Type"] == content_type
    assert response["Content-Disposition"] == f'attachment; filename="{filename}"'
    assert body_bytes(response) == b"office bytes"


def test_own_chat_uploads_open_with_course_and_standalone_conversations(owner_client, owner,
                                                                        course):
    for conversation in (Conversation.objects.create(owner=owner, course=course),
                         Conversation.objects.create(owner=owner)):
        upload = make(owner, conversation=conversation, title="My notes")
        response = get_file(owner_client, upload.pk)
        assert response.status_code == 200, conversation
        assert body_bytes(response) == b"%PDF-1.4 lecture bytes"


def test_foreign_missing_and_revoked_files_share_one_404(owner_client, owner, other_user,
                                                         course, foreign_course):
    foreign_material = make(other_user, course=foreign_course)
    foreign_upload = make(other_user, conversation=Conversation.objects.create(owner=other_user))
    # The student's own upload in a conversation whose course is no longer theirs.
    revoked_conversation = Conversation.objects.create(owner=owner, course=course)
    revoked_upload = make(owner, conversation=revoked_conversation)
    course.owner = other_user
    course.save(update_fields=["owner"])
    for document_id in (foreign_material.pk, foreign_upload.pk, revoked_upload.pk,
                        9223372036854775807, "abc", "0"):
        response = get_file(owner_client, document_id)
        assert response.status_code == 404, document_id
        assert response.json() == NOT_FOUND


def test_file_requires_authentication(owner, course):
    material = make(owner, course=course)
    response = APIClient().get(f"/api/v1/documents/{material.pk}/file/")
    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_missing_stored_file_is_a_503_not_a_crash(owner_client, owner, course):
    material = make(owner, course=course)
    material.file.storage.delete(material.file.name)
    response = get_file(owner_client, material.pk)
    assert response.status_code == 503
    assert response.json()["code"] == "MATERIAL_UNAVAILABLE"


def test_uploaded_pptx_downloads_unchanged_to_the_frontend_origin(owner_client, owner, course,
                                                                  office_factory):
    """The agreed PPTX flow: a real upload, the browser's CORS preflight for a bearer
    request from the frontend, then the download (an attachment with the same bytes)."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    conversation = Conversation.objects.create(owner=owner, course=course)
    deck = office_factory(".pptx")
    uploaded = owner_client.post(
        f"/api/v1/conversations/{conversation.pk}/documents/",
        {"file": SimpleUploadedFile("Week 2.pptx", deck, content_type=PPTX)}, format="multipart")
    assert uploaded.status_code == 201, uploaded.content
    document_id = uploaded.json()["id"]
    url = f"/api/v1/documents/{document_id}/file/"
    origin = "http://localhost:5173"

    preflight = APIClient().options(url, HTTP_ORIGIN=origin,
                                    HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
                                    HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization")
    assert preflight.status_code == 200
    assert preflight["Access-Control-Allow-Origin"] == origin
    assert "authorization" in preflight["Access-Control-Allow-Headers"].lower()

    response = owner_client.get(url, HTTP_ORIGIN=origin)
    body = b"".join(response.streaming_content)
    assert response.status_code == 200
    assert response["Access-Control-Allow-Origin"] == origin
    assert response["Content-Type"] == PPTX
    assert response["Content-Disposition"].startswith("attachment;")
    assert body == deck
