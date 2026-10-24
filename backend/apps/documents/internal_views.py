"""Authenticated internal endpoints used by the standalone processing service."""

import logging

from django.core.exceptions import RequestDataTooBig, SuspiciousFileOperation
from django.db import DatabaseError
from django.http import FileResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from apps.documents.models import Job
from apps.documents.validation import FORMATS
from apps.documents.result_callbacks import (
    InvalidCallback,
    MAX_CALLBACK_BYTES,
    apply_callback,
    decode_callback,
)
from apps.identity.service_auth import authorize_processing_service

logger = logging.getLogger(__name__)


@method_decorator(require_GET, name="dispatch")
class InternalJobDocumentView(View):
    """Stream a job's private source only to the configured processing service."""

    def get(self, request, job_id):
        unauthorized = authorize_processing_service(request)
        if unauthorized:
            return unauthorized
        # Bound the conversion before querying the signed BigAutoField key.
        job_id = str(job_id)
        if not job_id.isascii() or not job_id.isdecimal() or len(job_id) > 19:
            return JsonResponse({"error": "not_found"}, status=404)
        job_id = int(job_id)
        if not 0 < job_id <= 9223372036854775807:
            return JsonResponse({"error": "not_found"}, status=404)

        try:
            job = Job.objects.select_related("document").get(pk=job_id)
        except Job.DoesNotExist:
            return JsonResponse({"error": "not_found"}, status=404)

        document = job.document
        # Match callback authorization: a newer run supersedes this job.
        if Job.objects.filter(document_id=document.pk, pk__gt=job.pk).exists():
            return JsonResponse({"error": "stale_job"}, status=409)
        file_name = str(document.file.name or "")
        file_basename = file_name.rsplit("/", 1)[-1]
        if not file_basename:
            return JsonResponse({"error": "not_found"}, status=404)
        suffix = "." + file_basename.rsplit(".", 1)[-1].lower()
        if suffix not in FORMATS:
            return JsonResponse({"error": "unsupported_source"}, status=415)

        try:
            source = document.file.open("rb")
        except (OSError, SuspiciousFileOperation):
            logger.error("Could not open the source document for job %s.", job_id)
            return JsonResponse({"error": "source_unavailable"}, status=503)

        response = FileResponse(
            source,
            as_attachment=True,
            filename=f"source{suffix}",
            content_type=FORMATS[suffix],
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
        unauthorized = authorize_processing_service(request)
        if unauthorized:
            return unauthorized
        if request.content_type != "application/json":
            return JsonResponse({"error": "unsupported_content_type"}, status=415)

        content_length = request.META.get("CONTENT_LENGTH")
        if content_length:
            try:
                length = int(content_length)
                if length < 0:
                    return JsonResponse({"error": "invalid_content_length"}, status=400)
                if length > MAX_CALLBACK_BYTES:
                    return JsonResponse({"error": "callback_too_large"}, status=413)
            except ValueError:
                return JsonResponse({"error": "invalid_content_length"}, status=400)
        try:
            payload = decode_callback(request.body)
            outcome = apply_callback(job_id, payload)
        except InvalidCallback as exc:
            return JsonResponse({"error": str(exc)}, status=exc.status_code)
        except RequestDataTooBig:
            return JsonResponse({"error": "callback_too_large"}, status=413)
        except DatabaseError:
            logger.exception("Could not apply processing callback for job %s.", job_id)
            return JsonResponse({"error": "result_unavailable"}, status=503)

        return JsonResponse({"status": outcome})
