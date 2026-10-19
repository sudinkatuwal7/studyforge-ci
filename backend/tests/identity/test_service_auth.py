"""SCRUM-99: unit tests for the shared processing-service credential check."""

import json
import logging

import pytest
from django.test import RequestFactory

from apps.identity.service_auth import authorize_processing_service


TOKEN = "configured-service-token"


@pytest.fixture(autouse=True)
def service_token(settings):
    settings.PROCESSING_SERVICE_TOKEN = TOKEN


def call(authorization=None):
    headers = {} if authorization is None else {"HTTP_AUTHORIZATION": authorization}
    return authorize_processing_service(RequestFactory().get("/internal/v1/jobs/1/document/", **headers))


@pytest.mark.parametrize("authorization", [f"Bearer {TOKEN}", f"bearer {TOKEN}", f"BEARER {TOKEN}"])
def test_configured_token_authenticates(authorization):
    assert call(authorization) is None


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        TOKEN,
        f"Basic {TOKEN}",
        f"Token {TOKEN}",
        f"Bearer {TOKEN} ",
        f"Bearer  {TOKEN}",
        f"Bearer {TOKEN}x",
        f"Bearer {TOKEN[:-1]}",
        "Bearer wrong-token",
        "Bearer tökén",
    ],
)
def test_missing_malformed_or_wrong_credentials_are_unauthorized(authorization):
    response = call(authorization)
    assert response.status_code == 401
    assert json.loads(response.content) == {"error": "unauthorized"}
    assert response["WWW-Authenticate"] == 'Bearer realm="studyforge-internal"'


@pytest.mark.parametrize("configured", ["", None])
def test_unconfigured_server_token_fails_closed(settings, configured):
    settings.PROCESSING_SERVICE_TOKEN = configured
    # An empty bearer value must never match an empty configuration.
    for authorization in ("Bearer ", f"Bearer {TOKEN}", None):
        response = call(authorization)
        assert response.status_code == 503
        assert json.loads(response.content) == {"error": "service_unavailable"}


def test_rejections_never_log_or_return_credentials(caplog):
    with caplog.at_level(logging.DEBUG, logger="apps.identity.service_auth"):
        response = call("Bearer attacker-supplied-secret")
    assert response.status_code == 401
    logged = " ".join(record.getMessage() for record in caplog.records)
    assert "/internal/v1/jobs/1/document/" in logged
    for secret in ("attacker-supplied-secret", TOKEN):
        assert secret not in logged
        assert secret.encode() not in response.content
