"""Shared bearer authentication for the existing processing-service flow."""

import logging
import secrets

from django.conf import settings
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def authorize_processing_service(request):
    """Return an error response on failure, or None for an authenticated service."""
    expected_token = settings.PROCESSING_SERVICE_TOKEN
    if not expected_token:
        logger.error("Internal processing service token is not configured.")
        return JsonResponse({"error": "service_unavailable"}, status=503)

    scheme, _, provided_token = request.headers.get("Authorization", "").partition(" ")
    if (
        scheme.lower() != "bearer"
        or not provided_token
        or not secrets.compare_digest(
            provided_token.encode("utf-8"), expected_token.encode("utf-8")
        )
    ):
        return JsonResponse({"error": "unauthorized"}, status=401)
    return None
