"""Owner-protected PDF upload, material management, and status retrieval."""

from django.core.exceptions import RequestDataTooBig, SuspiciousOperation
from django.db import DatabaseError, transaction
from django.http import Http404
from rest_framework import exceptions
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.courses.models import Course
from apps.documents.errors import DocumentAPIError, error_body
from apps.documents.models import Document
from apps.documents.parsers import DocumentMultipartParser
from apps.documents.serializers import DocumentSerializer, validate_display_name
from apps.documents.services import delete_material, locked_material, store_and_dispatch
from apps.documents.validation import validate_pdf


def resource_id(value):
    # BigAutoField is a signed 64-bit integer; bound before querying PostgreSQL.
    if not value.isascii() or not value.isdecimal() or len(value) > 19:
        raise Http404
    pk = int(value)
    if not 0 < pk <= 9223372036854775807:
        raise Http404
    return pk


class DocumentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    parser_classes = [DocumentMultipartParser]

    def handle_exception(self, exc):
        if isinstance(exc, DocumentAPIError):
            return Response(exc.body, status=exc.status_code)
        if isinstance(exc, (exceptions.AuthenticationFailed, exceptions.NotAuthenticated)):
            return Response(
                error_body("AUTHENTICATION_REQUIRED"),
                status=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        if isinstance(exc, (Http404, exceptions.NotFound)):
            return Response(error_body("RESOURCE_NOT_FOUND"), status=404)
        if isinstance(exc, exceptions.UnsupportedMediaType):
            return Response(error_body("UNSUPPORTED_MEDIA_TYPE"), status=415)
        if isinstance(exc, RequestDataTooBig):
            return Response(error_body("FILE_TOO_LARGE"), status=413)
        if isinstance(exc, (exceptions.ParseError, SuspiciousOperation)):
            return Response(error_body("INVALID_REQUEST"), status=400)
        if isinstance(exc, (DatabaseError, OSError)):
            return Response(error_body("UPLOAD_UNAVAILABLE"), status=503)
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class DocumentUploadView(DocumentAPIView):
    def handle_exception(self, exc):
        if self.request.method == "GET" and isinstance(exc, (DatabaseError, OSError)):
            return Response(error_body("MATERIAL_UNAVAILABLE"), status=503)
        return super().handle_exception(exc)

    def get(self, request, course_id):
        course = Course.objects.filter(pk=resource_id(course_id), owner=request.user).first()
        if course is None:
            raise Http404
        documents = Document.objects.filter(course=course).order_by("-created_at", "-pk")
        return Response(DocumentSerializer(documents, many=True).data)

    def post(self, request, course_id):
        course = Course.objects.filter(pk=resource_id(course_id), owner=request.user).first()
        if course is None:
            raise Http404

        # Resolve ownership before accessing request.data, which parses the body.
        if request.content_type.split(";", 1)[0].strip().lower() != "multipart/form-data":
            raise DocumentAPIError("UNSUPPORTED_MEDIA_TYPE", 415)
        # DRF skips parser invocation for a zero-length body. Such a body has no
        # multipart framing; it differs from a valid form with a missing file.
        if request.stream is None:
            raise DocumentAPIError("INVALID_REQUEST")
        data = request.data
        if set(data) - {"file"}:
            raise DocumentAPIError("INVALID_UPLOAD")
        parts = data.getlist("file")
        files = request.FILES.getlist("file")
        if not parts:
            raise DocumentAPIError("FILE_REQUIRED")
        if len(parts) != 1 or len(files) != 1:
            raise DocumentAPIError("INVALID_UPLOAD")
        upload = files[0]
        title, sha256 = validate_pdf(upload)
        snapshot = store_and_dispatch(course=course, upload=upload, title=title, sha256=sha256)
        return Response(snapshot, status=201)


class DocumentDetailView(DocumentAPIView):
    parser_classes = [JSONParser]

    def handle_exception(self, exc):
        if isinstance(exc, (DatabaseError, OSError)):
            return Response(error_body("MATERIAL_UNAVAILABLE"), status=503)
        if isinstance(exc, (exceptions.ParseError, exceptions.UnsupportedMediaType)):
            return Response(error_body("INVALID_MATERIAL_UPDATE"), status=400)
        return super().handle_exception(exc)

    def patch(self, request, document_id):
        with transaction.atomic():
            document = locked_material(resource_id(document_id), request.user)
            document.title = validate_display_name(request.data)
            document.save(update_fields=["title", "updated_at"])
            return Response(DocumentSerializer(document).data)

    def delete(self, request, document_id):
        delete_material(resource_id(document_id), request.user)
        return Response(status=204)

    def get(self, request, document_id):
        document = Document.objects.filter(
            pk=resource_id(document_id), course__owner=request.user
        ).first()
        if document is None:
            raise Http404
        return Response(DocumentSerializer(document).data)
