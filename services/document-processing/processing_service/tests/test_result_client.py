from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from processing_service.errors import PermanentProcessingError, RetryableProcessingError
from processing_service.result_client import MAX_RESULT_BYTES, submit_callback


@override_settings(
    PROCESSING_DJANGO_API_URL="http://host.docker.internal:8000",
    PROCESSING_SERVICE_TOKEN="test-service-token",
)
class ResultClientTests(SimpleTestCase):
    def test_posts_correlated_callback_with_service_authentication(self):
        payload = {
            "schema_version": 1,
            "job_id": 17,
            "status": "RUNNING",
        }
        response = BytesIO(b'{"status":"applied"}')
        response.status = 200
        with patch("processing_service.result_client.urlopen", return_value=response) as urlopen:
            outcome = submit_callback(17, payload)

        self.assertEqual(outcome, "applied")
        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "http://host.docker.internal:8000/internal/v1/jobs/17/result/",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-service-token")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(json.loads(request.data), payload)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 30)

    def test_rejects_oversized_result_before_network_request(self):
        payload = {
            "schema_version": 1,
            "job_id": 17,
            "status": "SUCCEEDED",
            "padding": "x" * MAX_RESULT_BYTES,
        }
        with patch("processing_service.result_client.urlopen") as urlopen:
            with self.assertRaises(PermanentProcessingError):
                submit_callback(17, payload)
        urlopen.assert_not_called()

    def test_retries_temporary_django_callback_failures(self):
        with patch(
            "processing_service.result_client.urlopen",
            side_effect=TimeoutError("Django timed out"),
        ):
            with self.assertRaises(RetryableProcessingError):
                submit_callback(17, {"schema_version": 1, "job_id": 17, "status": "RUNNING"})

    def test_invalid_callback_response_fails_explicitly(self):
        response = BytesIO(b"not json")
        response.status = 200
        with patch("processing_service.result_client.urlopen", return_value=response):
            with self.assertRaises(PermanentProcessingError):
                submit_callback(17, {"schema_version": 1, "job_id": 17, "status": "RUNNING"})
