"""Document API contract: PDF uploads, authentication, ownership, and status."""

import hashlib
import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import Mock

import pytest
from django.db import connection
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart
from pypdf import PdfReader
from pypdf._page import PageObject
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.documents.models import Document, Job


LIMIT = 20 * 1024 * 1024  # Contract value; do not copy the implementation constant.


@pytest.mark.django_db(transaction=True)
class TestUpload:
    @pytest.mark.parametrize("kind", ["text", "scanned"])
    def test_upload_stores_pdf_without_extracting_text(
        self,
        kind, upload, uploaded_pdf, pdf_factory, course, dispatch, monkeypatch, media_root
    ):
        data = pdf_factory(kind)
        reader = PdfReader(BytesIO(data))
        assert len(reader.pages) == 1
        if kind == "scanned":
            assert reader.pages[0].extract_text() == ""
            assert reader.pages[0]["/Resources"]["/XObject"]["/Scan"]["/Subtype"] == "/Image"
        else:
            assert "StudyForge lecture" in reader.pages[0].extract_text()

        def no_extraction(*args, **kwargs):
            pytest.fail("Upload validation must not extract text")
        monkeypatch.setattr(PageObject, "extract_text", no_extraction)

        observed = []
        def handoff(document_id):
            assert not connection.in_atomic_block
            document = Document.objects.get(pk=document_id)
            assert document.status == "PENDING"
            job = document.jobs.get()
            assert (job.type, job.status, job.attempts, job.run_after) == (
                "DOCUMENT_PROCESSING", "QUEUED", 0, None
            )
            observed.append(document_id)
        dispatch.side_effect = handoff

        before = datetime.now(timezone.utc)
        response = upload(file=uploaded_pdf(data=data))
        after = datetime.now(timezone.utc)
        assert response.status_code == 201, response.content
        body = response.json()
        assert response["Content-Type"].split(";")[0] == "application/json"
        assert set(body) == {"id", "course_id", "name", "status", "created_at", "updated_at", "error"}
        assert type(body["id"]) is int and body["id"] > 0
        assert body["course_id"] == course.pk
        assert body["name"] == "lecture.pdf"
        assert body["status"] == "PENDING" and body["error"] is None
        assert body["created_at"] == body["updated_at"]
        assert body["created_at"].endswith("Z")
        assert before <= datetime.fromisoformat(body["created_at"]) <= after
        document = Document.objects.get(pk=body["id"])
        assert Document.objects.count() == Job.objects.count() == 1
        assert document.owner_id == course.owner_id
        assert document.course_id == course.pk
        assert document.sha256 == hashlib.sha256(data).hexdigest()
        assert document.page_count is None
        with document.file.open("rb") as stored:
            assert stored.read() == data
        assert len(list(media_root.rglob("*.pdf"))) == 1
        dispatch.assert_called_once_with(document.pk)
        assert observed == [document.pk]


    @pytest.mark.parametrize("name", ["lecture.PDF", "../lecture.pdf", r"C:\private\lecture.pdf"])
    def test_filename_is_a_safe_display_basename(self, upload, uploaded_pdf, name):
        response = upload(file=uploaded_pdf(name=name, content_type="application/octet-stream"))
        assert response.status_code == 201, response.content
        assert response.json()["name"] == ("lecture.PDF" if name.endswith(".PDF") else "lecture.pdf")
        document = Document.objects.get(pk=response.json()["id"])
        assert document.title not in document.file.name  # Storage key is independent.


    @pytest.mark.parametrize("kind,code", [
        ("empty", "EMPTY_FILE"),
        ("non-pdf", "INVALID_PDF"),
        ("fake-header", "INVALID_PDF"),
        ("truncated", "INVALID_PDF"),
        ("broken-page-reference", "INVALID_PDF"),
        ("zero-page", "INVALID_PDF"),
        ("encrypted", "UNSUPPORTED_PDF"),
    ])
    def test_invalid_pdfs_leave_no_state(
        self,
        kind, code, upload, uploaded_pdf, pdf_factory, assert_error, assert_no_upload
    ):
        if kind == "empty":
            data = b""
        elif kind == "non-pdf":
            data = b"This is plain text with a PDF filename and MIME type."
        elif kind == "fake-header":
            data = b"%PDF-1.7\nnot a real PDF\n%%EOF\n"
        elif kind == "truncated":
            data = pdf_factory()[:-40]
        elif kind == "broken-page-reference":
            # Preserve byte offsets while making the page tree reference undefined.
            data, changed = re.subn(rb"(/Kids\s*\[\s*)\d(\s+0 R)", rb"\g<1>0\2", pdf_factory(), count=1)
            assert changed == 1
        else:
            data = pdf_factory(kind)
        assert_error(upload(file=uploaded_pdf(data=data)), 400, code)
        assert_no_upload()


    @pytest.mark.parametrize("name", ["lecture.txt", "lecture.pdf.exe", "lecture"])
    def test_pdf_bytes_do_not_override_filename_policy(
        self,
        name, upload, uploaded_pdf, assert_error, assert_no_upload
    ):
        assert_error(upload(file=uploaded_pdf(name=name)), 400, "INVALID_PDF")
        assert_no_upload()


    @pytest.mark.parametrize("delta", [-1, 0, 1])
    def test_real_pdf_size_boundary(self, delta, upload, uploaded_pdf, pdf_factory, assert_error, assert_no_upload):
        data = pdf_factory(size=LIMIT + delta)
        assert len(data) == LIMIT + delta
        response = upload(file=uploaded_pdf(data=data))
        if delta > 0:
            assert_error(response, 413, "FILE_TOO_LARGE")
            assert_no_upload()
        else:
            assert response.status_code == 201, response.content
            document = Document.objects.get(pk=response.json()["id"])
            assert document.file.size == len(data)


    @pytest.mark.parametrize("case,code", [
        ("missing", "FILE_REQUIRED"),
        ("text-file", "INVALID_UPLOAD"),
        ("duplicate", "INVALID_UPLOAD"),
        ("file-and-text", "INVALID_UPLOAD"),
        ("wrong-field", "INVALID_UPLOAD"),
    ])
    def test_file_field_cardinality(self, case, code, owner_client, course, uploaded_pdf, assert_error, assert_no_upload):
        data = {
            "missing": {},
            "text-file": {"file": "lecture.pdf"},
            "duplicate": {"file": [uploaded_pdf(), uploaded_pdf()]},
            "file-and-text": {"file": [uploaded_pdf(), "lecture.pdf"]},
            "wrong-field": {"document": uploaded_pdf()},
        }[case]
        response = owner_client.post(f"/api/v1/courses/{course.pk}/documents/", data, format="multipart")
        assert_error(response, 400, code)
        assert_no_upload()


    @pytest.mark.parametrize("field", ["owner", "course_id", "id", "status", "name", "error", "created_at", "updated_at"])
    def test_client_cannot_set_server_fields(self, field, upload, assert_error, assert_no_upload):
        assert_error(upload(extra={field: "injected"}), 400, "INVALID_UPLOAD")
        assert_no_upload()


    @pytest.mark.parametrize("content_type", ["application/json", "application/pdf", "application/x-www-form-urlencoded"])
    def test_wrong_content_type(self, content_type, owner_client, course, assert_error, assert_no_upload):
        response = owner_client.generic(
            "POST", f"/api/v1/courses/{course.pk}/documents/", b"not multipart", content_type=content_type
        )
        assert_error(response, 415, "UNSUPPORTED_MEDIA_TYPE")
        assert_no_upload()


    @pytest.mark.parametrize("case", ["missing-boundary", "wrong-boundary", "truncated", "empty-body"])
    def test_malformed_multipart(self, case, owner_client, course, uploaded_pdf, assert_error, assert_no_upload):
        body = encode_multipart(BOUNDARY, {"file": uploaded_pdf()})
        content_type = MULTIPART_CONTENT
        if case == "missing-boundary":
            content_type = "multipart/form-data"
        elif case == "wrong-boundary":
            content_type = "multipart/form-data; boundary=wrong"
        elif case == "truncated":
            body = body.rsplit(f"--{BOUNDARY}--".encode(), 1)[0]
        else:
            body = b""
        response = owner_client.generic(
            "POST", f"/api/v1/courses/{course.pk}/documents/", body, content_type=content_type
        )
        assert_error(response, 400, "INVALID_REQUEST")
        assert_no_upload()


    def test_repeated_content_creates_independent_uploads(self, upload, dispatch):
        first, second = upload(), upload()
        assert first.status_code == second.status_code == 201
        assert first.json()["id"] != second.json()["id"]
        documents = list(Document.objects.order_by("pk"))
        assert documents[0].sha256 == documents[1].sha256
        assert documents[0].file.name != documents[1].file.name
        assert Job.objects.count() == 2
        assert dispatch.call_count == 2


@pytest.mark.django_db
class TestAccessAndStatus:
    @pytest.mark.parametrize("endpoint", ["upload", "detail"])
    @pytest.mark.parametrize("auth", ["missing", "invalid", "expired", "refresh", "deleted-user", "inactive-user"])
    def test_authentication_errors(
        self,
        endpoint, auth, api_client, owner, course, document_factory, assert_error, dispatch
    ):
        document = document_factory()
        if auth == "invalid":
            api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-jwt")
        elif auth != "missing":
            token = RefreshToken.for_user(owner) if auth == "refresh" else AccessToken.for_user(owner)
            if auth == "expired":
                token.set_exp(lifetime=timedelta(seconds=-60))
            api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            if auth == "deleted-user":
                owner.delete()
            elif auth == "inactive-user":
                owner.is_active = False
                owner.save(update_fields=["is_active"])
        if endpoint == "upload":
            # A bad body must not take precedence over invalid authentication.
            response = api_client.generic(
                "POST", f"/api/v1/courses/{course.pk}/documents/", b"bad", content_type="application/pdf"
            )
        else:
            response = api_client.get(f"/api/v1/documents/{document.pk}/")
        body = assert_error(response, 401, "AUTHENTICATION_REQUIRED")
        assert body["message"] == "Authentication is required."
        assert response["WWW-Authenticate"] == "Bearer"
        dispatch.assert_not_called()


    @pytest.mark.parametrize("endpoint", ["upload", "detail"])
    @pytest.mark.parametrize("resource", ["missing", "0", "-1", "abc", "1.5", "9223372036854775808", "9" * 100])
    def test_resource_ids_are_private_json_404s(
        self,
        endpoint, resource, owner_client, course, assert_error, assert_no_upload
    ):
        resource = str(course.pk + 1000000) if resource == "missing" else resource
        if endpoint == "upload":
            response = owner_client.post(f"/api/v1/courses/{resource}/documents/", {}, format="multipart")
        else:
            response = owner_client.get(f"/api/v1/documents/{resource}/")
        assert assert_error(response, 404, "RESOURCE_NOT_FOUND") == {
            "code": "RESOURCE_NOT_FOUND", "message": "Resource not found."
        }
        assert_no_upload()


    def test_foreign_course_matches_missing_course_before_validation(
        self,
        upload, foreign_course, uploaded_pdf, assert_error, assert_no_upload, monkeypatch
    ):
        validator = Mock(side_effect=AssertionError("Ownership must be checked first"))
        monkeypatch.setattr("apps.documents.views.validate_pdf", validator)
        foreign = upload(course_id=foreign_course.pk, file=uploaded_pdf(data=b"invalid"))
        missing = upload(course_id=foreign_course.pk + 1000000)
        assert_error(foreign, 404, "RESOURCE_NOT_FOUND")
        assert foreign.json() == missing.json()
        assert foreign.status_code == missing.status_code
        validator.assert_not_called()
        assert_no_upload()


    def test_foreign_document_matches_missing_document(
        self,
        owner_client, foreign_course, document_factory, assert_error, dispatch
    ):
        document = document_factory(related_course=foreign_course)
        foreign = owner_client.get(f"/api/v1/documents/{document.pk}/")
        missing = owner_client.get(f"/api/v1/documents/{document.pk + 1000000}/")
        assert_error(foreign, 404, "RESOURCE_NOT_FOUND")
        assert foreign.json() == missing.json()
        assert foreign.status_code == missing.status_code
        assert Document.objects.count() == 1
        dispatch.assert_not_called()


    def test_access_is_derived_from_course_not_just_document_owner(
        self,
        owner_client, owner, foreign_course, document_factory, assert_error
    ):
        # Simulate inconsistent legacy data: the direct owner FK cannot grant access
        # to a document attached to another student's course.
        document = document_factory(related_course=foreign_course)
        Document.objects.filter(pk=document.pk).update(owner=owner)
        assert_error(owner_client.get(f"/api/v1/documents/{document.pk}/"), 404, "RESOURCE_NOT_FOUND")


    @pytest.mark.parametrize("state,error_code,expected_error", [
        ("PENDING", None, None),
        ("PROCESSING", None, None),
        ("READY", None, None),
        ("FAILED", "PROCESSING_FAILED", {
            "code": "PROCESSING_FAILED", "message": "This PDF could not be processed."
        }),
        ("FAILED", "PROCESSING_DISPATCH_FAILED", {
            "code": "PROCESSING_DISPATCH_FAILED",
            "message": "The PDF was saved, but processing could not be started."
        }),
    ])
    def test_document_representation_for_each_persisted_state(
        self,
        state, error_code, expected_error, owner_client, document_factory, course, dispatch
    ):
        document = document_factory(status=state, error_code=error_code)
        response = owner_client.get(f"/api/v1/documents/{document.pk}/")
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"id", "course_id", "name", "status", "created_at", "updated_at", "error"}
        assert type(body["id"]) is int and body["id"] == document.pk
        assert type(body["course_id"]) is int and body["course_id"] == course.pk
        assert body["name"] == document.title
        assert body["status"] == state
        assert body["error"] == expected_error
        assert body["created_at"].endswith("Z") and body["updated_at"].endswith("Z")
        assert datetime.fromisoformat(body["updated_at"]) >= datetime.fromisoformat(body["created_at"])
        assert response["Cache-Control"] == "no-store"
        assert response["Content-Type"].split(";")[0] == "application/json"
        dispatch.assert_not_called()


    def test_get_reads_latest_state_without_executing_processing(self, owner_client, document_factory, dispatch):
        document = document_factory()
        url = f"/api/v1/documents/{document.pk}/"
        initial = owner_client.get(url).json()
        assert initial["status"] == "PENDING"
        # Arrange persisted worker output; this tests GET, not a worker algorithm.
        document.status = "READY"
        document.save(update_fields=["status"])
        latest = owner_client.get(url).json()
        assert latest["status"] == "READY"
        assert latest["created_at"] == initial["created_at"]
        assert datetime.fromisoformat(latest["updated_at"]) > datetime.fromisoformat(initial["updated_at"])
        dispatch.assert_not_called()
