"""SCRUM-106 upload validation and storage contract."""

import hashlib
from io import BytesIO
from zipfile import ZIP_STORED, ZipFile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.documents.models import Document, Job


MIMES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def file_upload(name, content, mime="application/octet-stream"):
    return SimpleUploadedFile(name, content, content_type=mime)


def padded_office(content, size):
    def append_padding(length):
        stream = BytesIO(content)
        with ZipFile(stream, "a") as archive:
            archive.writestr("scrum106-padding.bin", b"x" * length, compress_type=ZIP_STORED)
        return stream.getvalue()

    baseline = append_padding(0)
    result = append_padding(size - len(baseline))
    assert len(result) == size
    return result


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("suffix", [".docx", ".pptx"])
def test_office_upload_preserves_bytes_hash_suffix_and_canonical_mime(
    suffix, upload, office_factory, settings,
):
    data = office_factory(suffix)
    response = upload(file=file_upload("lecture" + suffix, data, "text/plain"))
    assert response.status_code == 201, response.content
    document = Document.objects.get(pk=response.json()["id"])
    assert document.file.name.endswith(suffix)
    assert document.sha256 == hashlib.sha256(data).hexdigest()
    with document.file.open("rb") as stored:
        assert stored.read() == data
    assert document.status == "PENDING"
    assert Job.objects.filter(document=document, status="QUEUED").exists()

    settings.PROCESSING_SERVICE_TOKEN = "test-service-token"
    result = Client().get(
        f"/internal/v1/jobs/{document.jobs.get().pk}/document/",
        HTTP_AUTHORIZATION="Bearer test-service-token",
    )
    assert result.status_code == 200
    assert result["Content-Type"] == MIMES[suffix]
    assert result["X-Source-SHA256"] == document.sha256
    assert b"".join(result.streaming_content) == data


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("suffix", [".docx", ".pptx"])
def test_office_material_list_rename_delete(suffix, upload, office_factory, owner_client, course):
    response = upload(file=file_upload("lecture" + suffix, office_factory(suffix)))
    document_id = response.json()["id"]
    list_url = f"/api/v1/courses/{course.pk}/documents/"
    assert any(item["id"] == document_id for item in owner_client.get(list_url).json())
    rename = owner_client.patch(
        f"/api/v1/documents/{document_id}/", {"name": "Renamed material"}, format="json"
    )
    assert rename.status_code == 200
    assert rename.json()["name"] == "Renamed material"
    assert Document.objects.get(pk=document_id).file.name.endswith(suffix)
    assert owner_client.delete(f"/api/v1/documents/{document_id}/").status_code == 204
    assert not Document.objects.filter(pk=document_id).exists()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("name,kind,code", [
    ("notes.txt", "docx", "INVALID_FORMAT"),
    ("fake.docx", "zip", "INVALID_OFFICE"),
    ("fake.pptx", "zip", "INVALID_OFFICE"),
    ("wrong.pptx", "docx", "INVALID_OFFICE"),
    ("wrong.docx", "pptx", "INVALID_OFFICE"),
    ("pdf.docx", "pdf", "INVALID_OFFICE"),
    ("word.pdf", "docx", "INVALID_PDF"),
    ("corrupt.docx", "corrupt", "INVALID_OFFICE"),
    ("corrupt.pptx", "corrupt", "INVALID_OFFICE"),
    ("empty.docx", "empty", "EMPTY_FILE"),
])
def test_invalid_office_upload_leaves_no_state(name, kind, code, upload, office_factory, pdf_factory):
    if kind == "zip":
        stream = BytesIO()
        with ZipFile(stream, "w") as archive:
            archive.writestr("hello.txt", "ordinary ZIP")
        content = stream.getvalue()
    elif kind == "corrupt":
        content = office_factory("." + name.rsplit(".", 1)[-1])[:120]
    elif kind == "empty":
        content = b""
    elif kind == "pdf":
        content = pdf_factory()
    else:
        content = office_factory("." + kind)
    response = upload(file=file_upload(name, content))
    assert response.status_code == 400
    assert response.json()["code"] == code
    assert not Document.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_office_size_and_ownership_checks_precede_storage(
    upload, owner_client, foreign_course, office_factory, course,
):
    content = office_factory(".docx")
    unauthorized = upload(file=file_upload("lecture.docx", content), course_id=foreign_course.pk)
    assert unauthorized.status_code == 404
    no_auth = Client().post(
        f"/api/v1/courses/{course.pk}/documents/",
        {"file": file_upload("lecture.docx", content)},
    )
    assert no_auth.status_code == 401
    oversized = upload(file=file_upload("huge.docx", b"x" * (20 * 1024 * 1024 + 1)))
    assert oversized.status_code == 413
    assert not Document.objects.exists()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("suffix", [".docx", ".pptx"])
def test_office_exact_20_mib_boundary(suffix, upload, office_factory):
    limit = 20 * 1024 * 1024
    content = padded_office(office_factory(suffix), limit)
    response = upload(file=file_upload("boundary" + suffix, content))
    assert response.status_code == 201, response.content
    document = Document.objects.get(pk=response.json()["id"])
    assert document.file.size == limit
