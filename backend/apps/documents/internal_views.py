"""Authenticated internal endpoints used by the standalone processing service."""

import logging
import secrets

from django.conf import settings
from django.db import DatabaseError
from django.http import FileResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from apps.documents.models import Job
from apps.documents.result_callbacks import (
    InvalidCallback,
    MAX_CALLBACK_BYTES,
    apply_callback,
    decode_callback,
)

logger = logging.getLogger(__name__)


def _authorize_processing_service(request):
    expected_token = settings.PROCESSING_SERVICE_TOKEN
    if not expected_token:
        logger.error("Internal processing service token is not configured.")
        return JsonResponse({"error": "service_unavailable"}, status=503)

    scheme, _, provided_token = request.headers.get("Authorization", "").partition(" ")
    if (
        scheme.lower() != "bearer"
        or not provided_token
        or not secrets.compare_digest(provided_token, expected_token)
    ):
        return JsonResponse({"error": "unauthorized"}, status=401)
    return None


@method_decorator(require_GET, name="dispatch")
class InternalJobDocumentView(View):
    """Stream a job's private PDF only to the configured processing service."""

    def get(self, request, job_id):
        unauthorized = _authorize_processing_service(request)
        if unauthorized:
            return unauthorized

        try:
            job = Job.objects.select_related("document").get(pk=job_id)
        except Job.DoesNotExist:
            return JsonResponse({"error": "not_found"}, status=404)

        document = job.document
        if not document.file:
            return JsonResponse({"error": "not_found"}, status=404)

        try:
            source = document.file.open("rb")
        except OSError:
            logger.exception("Could not open the source PDF for job %s.", job_id)
            return JsonResponse({"error": "source_unavailable"}, status=503)

        response = FileResponse(
            source,
            as_attachment=True,
            filename="source.pdf",
            content_type="application/pdf",
        )
        response["X-Document-ID"] = str(document.pk)
        response["X-Source-SHA256"] = document.sha256
        response["Cache-Control"] = "no-store"
        return response


@method_decorator(require_POST, name="dispatch")
@method_decorator(csrf_exempt, name="dispatch")
class InternalJobResultView(View):
    """Apply authenticated processing status and result callbacks."""

    def post(self, request, job_id):
        unauthorized = _authorize_processing_service(request)
        if unauthorized:
            return unauthorized
        if request.content_type != "application/json":
            return JsonResponse({"error": "unsupported_content_type"}, status=415)

        content_length = request.META.get("CONTENT_LENGTH")
        if content_length:
            try:
                if int(content_length) > MAX_CALLBACK_BYTES:
                    return JsonResponse({"error": "callback_too_large"}, status=413)
            except ValueError:
                return JsonResponse({"error": "invalid_content_length"}, status=400)
        try:
            payload = decode_callback(request.body)
            outcome = apply_callback(job_id, payload)
        except InvalidCallback as exc:
            if str(exc) == "job_not_found":
                status = 404
            elif str(exc) == "source_mismatch":
                status = 409
            else:
                status = 400
            return JsonResponse({"error": str(exc)}, status=status)
        except DatabaseError:
            logger.exception("Could not apply processing callback for job %s.", job_id)
            return JsonResponse({"error": "result_unavailable"}, status=503)

        return JsonResponse({"status": outcome})
