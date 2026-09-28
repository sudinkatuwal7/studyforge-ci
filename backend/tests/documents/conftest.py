"""SCRUM-12 fixtures: real database/storage, real JWTs, mocked processing."""

import hashlib
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock
from uuid import uuid4

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.courses.models import Course
from apps.documents.models import Document, Job


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    with TemporaryDirectory(prefix="uploads-", dir=tmp_path) as directory:
        settings.MEDIA_ROOT = directory
        yield Path(directory)


@pytest.fixture(autouse=True)
def dispatch(monkeypatch):
    # Never contact a real broker, even if an endpoint's mock target changes.
    monkeypatch.setattr(
        "apps.documents.dispatch.Celery",
        Mock(side_effect=AssertionError("A test must not open a real broker connection")),
    )
    mocked = Mock()
    monkeypatch.setattr("apps.documents.services.dispatch_document", mocked)
    return mocked


@pytest.fixture
def owner(django_user_model):
    return django_user_model.objects.create(email="owner@example.test")


@pytest.fixture
def other_user(django_user_model):
    return django_user_model.objects.create(email="other@example.test")


@pytest.fixture
def course(owner):
    return Course.objects.create(owner=owner, name="Operating Systems")


@pytest.fixture
def foreign_course(other_user):
    return Course.objects.create(owner=other_user, name="Private course")


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner_client(owner, api_client):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(owner)}")
    return api_client


@pytest.fixture(scope="session")
def pdf_factory():
    @lru_cache(maxsize=8)
    def make(kind="text", size=None):
        padding = 0
        for _ in range(5):
            writer = PdfWriter()
            if kind != "zero-page":
                page = writer.add_blank_page(width=200, height=200)
                content = DecodedStreamObject()
                if kind == "scanned":
                    image = DecodedStreamObject()
                    image.set_data(b"\xff\xff\xff")
                    image.update({
                        NameObject("/Type"): NameObject("/XObject"),
                        NameObject("/Subtype"): NameObject("/Image"),
                        NameObject("/Width"): NumberObject(1),
                        NameObject("/Height"): NumberObject(1),
                        NameObject("/BitsPerComponent"): NumberObject(8),
                        NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
                    })
                    page[NameObject("/Resources")] = DictionaryObject({
                        NameObject("/XObject"): DictionaryObject({
                            NameObject("/Scan"): writer._add_object(image),
                        }),
                    })
                    content.set_data(b"q 200 0 0 200 0 0 cm /Scan Do Q")
                else:
                    font = DictionaryObject({
                        NameObject("/Type"): NameObject("/Font"),
                        NameObject("/Subtype"): NameObject("/Type1"),
                        NameObject("/BaseFont"): NameObject("/Helvetica"),
                    })
                    page[NameObject("/Resources")] = DictionaryObject({
                        NameObject("/Font"): DictionaryObject({
                            NameObject("/F1"): writer._add_object(font),
                        }),
                    })
                    content.set_data(b"BT /F1 12 Tf 10 30 Td (StudyForge lecture) Tj ET")
                page[NameObject("/Contents")] = writer._add_object(content)
            if kind == "encrypted":
                writer.encrypt("test-password")
            if size is not None:
                writer.add_metadata({"/Padding": "x" * padding})
            buffer = BytesIO()
            writer.write(buffer)
            result = buffer.getvalue()
            if size is None or len(result) == size:
                return result
            padding += size - len(result)
            assert padding >= 0, "Requested size is too small for the fixture PDF"
        raise AssertionError("Could not generate a PDF at the requested byte boundary")

    return make


@pytest.fixture
def uploaded_pdf(pdf_factory):
    def make(*, data=None, name="lecture.pdf", content_type="application/pdf", kind="text"):
        return SimpleUploadedFile(
            name, pdf_factory(kind) if data is None else data, content_type=content_type
        )
    return make


@pytest.fixture
def upload(owner_client, course, uploaded_pdf):
    def post(*, file=None, course_id=None, extra=None):
        data = {"file": uploaded_pdf() if file is None else file}
        data.update(extra or {})
        return owner_client.post(
            f"/api/v1/courses/{course.pk if course_id is None else course_id}/documents/",
            data,
            format="multipart",
        )
    return post


@pytest.fixture
def document_factory(course, pdf_factory):
    def make(*, related_course=None, status="PENDING", error_code=None):
        related_course = related_course or course
        content = pdf_factory()
        return Document.objects.create(
            course=related_course,
            owner=related_course.owner,
            title="lecture.pdf",
            sha256=hashlib.sha256(content).hexdigest(),
            file=ContentFile(content, name=f"{uuid4().hex}.pdf"),
            status=status,
            error_code=error_code,
        )
    return make


@pytest.fixture
def assert_error():
    def check(response, status, code, *, wrapped=False):
        assert response.status_code == status, response.content
        assert response["Content-Type"].split(";")[0] == "application/json"
        body = response.json()
        if wrapped:
            assert set(body) == {"document_id", "error"}
            assert type(body["document_id"]) is int and body["document_id"] > 0
            body = body["error"]
        assert set(body) == {"code", "message"}
        assert body["code"] == code
        assert isinstance(body["message"], str) and body["message"].strip()
        return body
    return check


@pytest.fixture
def assert_no_upload(media_root, dispatch):
    def check():
        assert not Document.objects.exists()
        assert not Job.objects.exists()
        assert not [path for path in media_root.rglob("*") if path.is_file()]
        dispatch.assert_not_called()
    return check
