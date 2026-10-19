"""SCRUM-99: identity verification and course ownership for document operations."""

from unittest.mock import patch

import pytest
from django.db import DatabaseError
from rest_framework_simplejwt.tokens import AccessToken

from apps.courses.models import Course
from apps.documents.models import Document, Job
from apps.identity.ownership import owned_course, owned_documents


SERVICE_TOKEN = "scrum-99-service-token"


@pytest.fixture(autouse=True)
def service_token(settings):
    settings.PROCESSING_SERVICE_TOKEN = SERVICE_TOKEN


@pytest.mark.django_db
class TestCredentialsStayInTheirBoundary:
    @pytest.mark.parametrize("method, path", [
        ("post", "/api/v1/courses/{course}/documents/"),
        ("get", "/api/v1/courses/{course}/documents/"),
        ("get", "/api/v1/documents/{document}/"),
        ("patch", "/api/v1/documents/{document}/"),
        ("delete", "/api/v1/documents/{document}/"),
    ])
    def test_service_token_is_not_a_student_credential(
        self, method, path, api_client, course, document_factory, uploaded_pdf, assert_error, dispatch
    ):
        document = document_factory()
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {SERVICE_TOKEN}")
        url = path.format(course=course.pk, document=document.pk)
        data = {"file": uploaded_pdf()} if method == "post" else None
        response = getattr(api_client, method)(url, data, format="multipart" if data else None)

        assert_error(response, 401, "AUTHENTICATION_REQUIRED")
        document.refresh_from_db()
        assert document.title == "lecture.pdf"
        assert Document.objects.count() == 1
        dispatch.assert_not_called()

    @pytest.mark.parametrize("route, method", [("document", "get"), ("result", "post")])
    def test_student_jwt_is_not_a_service_credential(self, route, method, api_client, owner, document_factory):
        job = Job.objects.create(document=document_factory())
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(owner)}")
        with patch("django.db.models.fields.files.FieldFile.open") as open_file:
            response = getattr(api_client, method)(f"/internal/v1/jobs/{job.pk}/{route}/")

        assert response.status_code == 401
        assert response.json() == {"error": "unauthorized"}
        open_file.assert_not_called()


@pytest.mark.django_db
class TestIdentityUnavailable:
    @pytest.mark.parametrize("method, path, code", [
        ("post", "/api/v1/courses/{course}/documents/", "UPLOAD_UNAVAILABLE"),
        ("get", "/api/v1/courses/{course}/documents/", "MATERIAL_UNAVAILABLE"),
        ("get", "/api/v1/documents/{document}/", "MATERIAL_UNAVAILABLE"),
        ("delete", "/api/v1/documents/{document}/", "MATERIAL_UNAVAILABLE"),
    ])
    def test_user_lookup_failure_fails_closed(
        self, method, path, code, owner_client, course, document_factory, uploaded_pdf, assert_error, dispatch
    ):
        document = document_factory()
        url = path.format(course=course.pk, document=document.pk)
        data = {"file": uploaded_pdf()} if method == "post" else None
        failure = DatabaseError("identity store host=db password=secret")
        with patch(
            "rest_framework_simplejwt.authentication.JWTAuthentication.get_user",
            side_effect=failure,
        ):
            response = getattr(owner_client, method)(url, data, format="multipart" if data else None)

        assert_error(response, 503, code)
        assert b"secret" not in response.content
        assert Document.objects.filter(pk=document.pk).exists()
        assert Document.objects.count() == 1
        dispatch.assert_not_called()

    def test_ownership_lookup_failure_stores_nothing(self, upload, assert_error, assert_no_upload):
        with patch("apps.documents.views.owned_course", side_effect=DatabaseError("down")):
            response = upload()
        assert_error(response, 503, "UPLOAD_UNAVAILABLE")
        assert_no_upload()


@pytest.mark.django_db
class TestOwnershipRule:
    def test_foreign_and_missing_courses_are_indistinguishable(self, owner, course, foreign_course):
        assert owned_course(owner, course.pk) == course
        assert owned_course(owner, foreign_course.pk) is None
        assert owned_course(owner, foreign_course.pk + 1000000) is None

    def test_documents_are_scoped_through_course_ownership(
        self, owner, other_user, course, foreign_course, document_factory
    ):
        own = document_factory()
        foreign = document_factory(related_course=foreign_course)
        assert list(owned_documents(owner)) == [own]
        assert list(owned_documents(other_user)) == [foreign]

    def test_document_owner_field_alone_grants_no_access(self, owner, other_user, document_factory):
        # Only Course.owner confers access, even if a Document row's owner disagrees.
        moved = Course.objects.create(owner=other_user, name="Transferred")
        document = document_factory()
        Document.objects.filter(pk=document.pk).update(course=moved)
        assert not owned_documents(owner).filter(pk=document.pk).exists()
        assert owned_documents(other_user).filter(pk=document.pk).exists()
