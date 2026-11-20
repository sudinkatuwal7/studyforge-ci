"""Password reset API behavior and session revocation."""

from datetime import datetime, timedelta
import re
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.cache import caches
from django.core import mail
from django.http import HttpRequest
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


User = get_user_model()
REQUEST_URL = "/api/v1/auth/password-reset/request/"
VALIDATE_URL = "/api/v1/auth/password-reset/validate/"
CONFIRM_URL = "/api/v1/auth/password-reset/confirm/"
ME_URL = "/api/v1/auth/me/"
REFRESH_URL = "/api/v1/auth/token/refresh/"
LOGIN_URL = "/api/v1/auth/token/"
CSRF_URL = "/api/v1/auth/csrf/"
RESET_BROWSER_COOKIE = "studyforge_reset_browser"
REQUEST_CONFIRMATION = {
    "detail": "If an eligible account exists, we will email a password reset link."
}
EMAIL_NOT_FOUND = {
    "code": "EMAIL_NOT_FOUND",
    "detail": "No account found with that email address.",
}
RESET_REQUEST_LIMITED = {
    "code": "RESET_REQUEST_LIMITED",
    "detail": "Too many password reset requests. Please try again later.",
}
INVALID_LINK = {
    "code": "INVALID_RESET_LINK",
    "detail": "This reset link is invalid or expired.",
}
NEW_PASSWORD = "AnotherEveningRiver!9362"


@pytest.fixture(autouse=True)
def reset_settings(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.PASSWORD_RESET_FRONTEND_URL = "https://frontend.example.test"
    settings.PASSWORD_RESET_TIMEOUT = 60 * 60
    caches["password_reset"].clear()


@pytest.fixture
def user():
    return User.objects.create_user(
        email=f"student-{uuid4().hex}@example.edu",
        password="EveningRivers!8462",
        first_name="Sam",
        last_name="Student",
    )


@pytest.fixture
def client_with_csrf():
    client = APIClient(enforce_csrf_checks=True)
    response = client.get(CSRF_URL)
    assert response.status_code == 200
    octets = uuid4().bytes
    remote_addr = f"10.{octets[0]}.{octets[1]}.{octets[2]}"
    return client, client.cookies["csrftoken"].value, remote_addr


def test_csrf_issues_stable_signed_browser_cookie(settings):
    settings.DEBUG = False
    client = APIClient(enforce_csrf_checks=True)
    first = client.get(CSRF_URL)

    assert first.status_code == 200
    assert first["Cache-Control"] == "no-store"
    cookie = first.cookies[RESET_BROWSER_COOKIE]
    assert cookie["httponly"]
    assert cookie["secure"]
    assert cookie["samesite"] == "Lax"
    assert cookie["path"] == "/api/v1/auth/"
    assert int(cookie["max-age"]) == 2 * 60 * 60
    cookie_request = HttpRequest()
    cookie_request.COOKIES[RESET_BROWSER_COOKIE] = cookie.value
    first_id = cookie_request.get_signed_cookie(
        RESET_BROWSER_COOKIE,
        salt="studyforge.password-reset.browser",
        max_age=2 * 60 * 60,
    )

    second = client.get(CSRF_URL)
    cookie_request.COOKIES[RESET_BROWSER_COOKIE] = second.cookies[RESET_BROWSER_COOKIE].value
    second_id = cookie_request.get_signed_cookie(
        RESET_BROWSER_COOKIE,
        salt="studyforge.password-reset.browser",
        max_age=2 * 60 * 60,
    )
    assert second_id == first_id


def post(client_with_csrf, url, payload, *, csrf=True, remote_addr=None):
    client, csrf_token, fixture_addr = client_with_csrf
    headers = {"REMOTE_ADDR": remote_addr or fixture_addr}
    if csrf:
        headers["HTTP_X_CSRFTOKEN"] = csrf_token
    return client.post(url, payload, format="json", **headers)


def request_link(client_with_csrf, email, *, remote_addr=None):
    response = post(
        client_with_csrf, REQUEST_URL, {"email": email}, remote_addr=remote_addr
    )
    assert response.status_code == 200
    assert response.json() == REQUEST_CONFIRMATION
    return response


def link_parts(message):
    urls = re.findall(r"https://[^\s<>]+", message.body)
    assert len(urls) == 1
    url = urlsplit(urls[0].rstrip(".,)>"))
    assert url.scheme == "https"
    assert url.netloc == "frontend.example.test"
    assert url.query == ""
    assert url.fragment == ""
    parts = url.path.strip("/").split("/")
    assert len(parts) == 3
    assert parts[0] == "reset-password"
    return parts[1], parts[2]


@pytest.mark.django_db
def test_unknown_email_is_reported_and_ineligible_accounts_remain_generic(
    client_with_csrf, user
):
    inactive = User.objects.create_user(
        email=f"inactive-{uuid4().hex}@example.edu",
        password="EveningRivers!8462",
        is_active=False,
    )
    google_only = User.objects.create_user(
        email=f"google-{uuid4().hex}@example.edu",
        google_sub=f"google-{uuid4().hex}",
    )
    assert not google_only.has_usable_password()
    unknown = f"unknown-{uuid4().hex}@example.edu"

    responses = [
        request_link(client_with_csrf, email)
        for email in (user.email, inactive.email, google_only.email)
    ]
    missing = post(client_with_csrf, REQUEST_URL, {"email": unknown})

    assert all(response.status_code == 200 for response in responses)
    assert all(response.json() == REQUEST_CONFIRMATION for response in responses)
    assert missing.status_code == 404
    assert missing.json() == EMAIL_NOT_FOUND
    assert missing["Cache-Control"] == "no-store"
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user.email]


@pytest.mark.django_db
def test_case_only_duplicate_emails_do_not_choose_an_arbitrary_account(
    client_with_csrf, user, caplog
):
    # This can come from imported or legacy data that bypassed create_user().
    duplicate = User(email=user.email.upper())
    duplicate.set_password("AnotherEveningRiver!9362")
    duplicate.save()

    response = request_link(client_with_csrf, user.email)

    assert response.json() == REQUEST_CONFIRMATION
    assert len(mail.outbox) == 0
    assert "Password reset email lookup is ambiguous." in caplog.text
    assert user.email not in caplog.text


@pytest.mark.django_db
def test_reset_link_uses_configured_origin_not_request_host(client_with_csrf, user, settings):
    settings.ALLOWED_HOSTS = [*settings.ALLOWED_HOSTS, "untrusted.example.test"]
    client, csrf_token, remote_addr = client_with_csrf

    response = client.post(
        REQUEST_URL,
        {"email": user.email},
        format="json",
        HTTP_HOST="untrusted.example.test",
        HTTP_X_CSRFTOKEN=csrf_token,
        REMOTE_ADDR=remote_addr,
    )

    assert response.status_code == 200
    assert response.json() == REQUEST_CONFIRMATION
    link_parts(mail.outbox[0])


@pytest.mark.django_db
def test_mail_failure_keeps_the_generic_request_response(client_with_csrf, user, caplog):
    inactive = User.objects.create_user(
        email=f"inactive-{uuid4().hex}@example.edu",
        password="EveningRivers!8462",
        is_active=False,
    )
    with patch("apps.users.password_reset.send_mail", side_effect=ConnectionError):
        eligible = request_link(client_with_csrf, user.email)
    ineligible = request_link(client_with_csrf, inactive.email)

    assert eligible.json() == ineligible.json() == REQUEST_CONFIRMATION
    assert len(mail.outbox) == 0
    assert "Password reset request email failed (ConnectionError)." in caplog.text
    assert user.email not in caplog.text
    assert "reset-password/" not in caplog.text


@pytest.mark.django_db
def test_unaccepted_request_email_is_logged_without_disclosing_account(
    client_with_csrf, user, caplog
):
    with patch("apps.users.password_reset.send_mail", return_value=0):
        response = request_link(client_with_csrf, user.email)

    assert response.json() == REQUEST_CONFIRMATION
    assert "Password reset request email failed (not accepted)." in caplog.text
    assert user.email not in caplog.text
    assert "reset-password/" not in caplog.text


@pytest.mark.django_db
def test_successful_reset_is_one_use_and_ends_prior_sessions(client_with_csrf, user):
    first_session = RefreshToken.for_user(user)
    second_session = RefreshToken.for_user(user)
    old_access = str(first_session.access_token)

    request_link(client_with_csrf, user.email.upper())
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user.email]
    uid, token = link_parts(mail.outbox[0])

    valid = post(client_with_csrf, VALIDATE_URL, {"uid": uid, "token": token})
    assert valid.status_code == 200
    assert valid.json() == {"valid": True}

    result = post(
        client_with_csrf,
        CONFIRM_URL,
        {"uid": uid, "token": token, "new_password": NEW_PASSWORD},
    )

    assert result.status_code == 200
    assert result.json() == {"detail": "Your password has been reset."}
    assert "studyforge_refresh" not in result.cookies
    assert "access" not in result.json()
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert len(mail.outbox) == 2
    assert mail.outbox[1].to == [user.email]
    assert NEW_PASSWORD not in mail.outbox[1].body

    # Resetting the password does not authenticate the request that used the link.
    client, _, _ = client_with_csrf
    assert client.get(ME_URL).status_code == 401
    assert post(client_with_csrf, REFRESH_URL, {}).status_code == 401

    # Access and refresh tokens from every device must stop working.
    old_access_client = APIClient()
    old_access_client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
    assert old_access_client.get(ME_URL).status_code == 401
    for old_refresh in (first_session, second_session):
        refresh_client = APIClient()
        refresh_client.cookies["studyforge_refresh"] = str(old_refresh)
        assert refresh_client.post(REFRESH_URL, {}, format="json").status_code == 401

    reused = post(client_with_csrf, VALIDATE_URL, {"uid": uid, "token": token})
    assert reused.status_code == 400
    assert reused.json() == INVALID_LINK
    reused = post(
        client_with_csrf,
        CONFIRM_URL,
        {"uid": uid, "token": token, "new_password": "ThirdEveningRiver!9362"},
    )
    assert reused.status_code == 400
    assert reused.json() == INVALID_LINK
    assert len(mail.outbox) == 2

    old_login = post(
        client_with_csrf,
        LOGIN_URL,
        {"email": user.email, "password": "EveningRivers!8462"},
    )
    assert old_login.status_code == 401
    new_login = post(
        client_with_csrf, LOGIN_URL, {"email": user.email, "password": NEW_PASSWORD}
    )
    assert new_login.status_code == 200


@pytest.mark.django_db
def test_confirmation_mail_failure_preserves_completed_reset(client_with_csrf, user, caplog):
    request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])

    with patch("apps.users.password_reset.send_mail", side_effect=ConnectionError):
        result = post(
            client_with_csrf,
            CONFIRM_URL,
            {"uid": uid, "token": token, "new_password": NEW_PASSWORD},
        )

    assert result.status_code == 200
    assert result.json() == {"detail": "Your password has been reset."}
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert "Password reset confirmation email failed (ConnectionError)." in caplog.text
    assert user.email not in caplog.text
    assert token not in caplog.text


@pytest.mark.django_db
def test_replaying_a_reset_revoked_token_does_not_end_a_new_session(
    client_with_csrf, user
):
    old_refresh = str(RefreshToken.for_user(user))
    request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])
    reset = post(
        client_with_csrf,
        CONFIRM_URL,
        {"uid": uid, "token": token, "new_password": NEW_PASSWORD},
    )
    assert reset.status_code == 200

    login = post(
        client_with_csrf, LOGIN_URL, {"email": user.email, "password": NEW_PASSWORD}
    )
    assert login.status_code == 200
    new_refresh = login.cookies["studyforge_refresh"].value

    old_client = APIClient()
    old_client.cookies["studyforge_refresh"] = old_refresh
    assert old_client.post(REFRESH_URL, {}, format="json").status_code == 401

    new_client = APIClient()
    new_client.cookies["studyforge_refresh"] = new_refresh
    assert new_client.post(REFRESH_URL, {}, format="json").status_code == 200


@pytest.mark.django_db
def test_expired_link_can_be_replaced(client_with_csrf, user):
    issued_at = datetime(2026, 11, 19, 12, 0, 0)
    with patch.object(PasswordResetTokenGenerator, "_now", return_value=issued_at):
        request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])

    with patch.object(
        PasswordResetTokenGenerator,
        "_now",
        return_value=issued_at + timedelta(minutes=60, seconds=1),
    ):
        validation = post(client_with_csrf, VALIDATE_URL, {"uid": uid, "token": token})
        confirmation = post(
            client_with_csrf,
            CONFIRM_URL,
            {"uid": uid, "token": token, "new_password": NEW_PASSWORD},
        )
        request_link(client_with_csrf, user.email)

    assert validation.status_code == 400
    assert validation.json() == INVALID_LINK
    assert confirmation.status_code == 400
    assert confirmation.json() == INVALID_LINK
    assert len(mail.outbox) == 2
    assert link_parts(mail.outbox[1]) != (uid, token)
    user.refresh_from_db()
    assert user.check_password("EveningRivers!8462")


@pytest.mark.django_db
def test_altered_token_and_user_id_are_rejected(client_with_csrf, user):
    other_user = User.objects.create_user(
        email=f"other-{uuid4().hex}@example.edu",
        password="MorningLakes!5173",
    )
    request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])
    altered_token = token[:-1] + ("a" if token[-1] != "a" else "b")
    other_uid = urlsafe_base64_encode(force_bytes(other_user.pk))

    for bad_uid, bad_token in ((uid, altered_token), (other_uid, token), ("?", token)):
        validation = post(
            client_with_csrf, VALIDATE_URL, {"uid": bad_uid, "token": bad_token}
        )
        confirmation = post(
            client_with_csrf,
            CONFIRM_URL,
            {"uid": bad_uid, "token": bad_token, "new_password": NEW_PASSWORD},
        )
        assert validation.status_code == 400
        assert validation.json() == INVALID_LINK
        assert confirmation.status_code == 400
        assert confirmation.json() == INVALID_LINK

    user.refresh_from_db()
    other_user.refresh_from_db()
    assert user.check_password("EveningRivers!8462")
    assert other_user.check_password("MorningLakes!5173")
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_weak_password_is_rejected_without_consuming_link(client_with_csrf, user):
    request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])

    response = post(
        client_with_csrf,
        CONFIRM_URL,
        {"uid": uid, "token": token, "new_password": "123"},
    )

    assert response.status_code == 400
    assert "new_password" in response.json()
    assert post(client_with_csrf, VALIDATE_URL, {"uid": uid, "token": token}).json() == {
        "valid": True
    }
    user.refresh_from_db()
    assert user.check_password("EveningRivers!8462")
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_email_request_limit_is_generic(client_with_csrf, user):
    responses = [
        request_link(client_with_csrf, email, remote_addr=f"10.0.0.{index}")
        for index, email in enumerate(
            (user.email, user.email.upper(), user.email, user.email), start=1
        )
    ]

    assert all(response.json() == REQUEST_CONFIRMATION for response in responses)
    assert len(mail.outbox) == 3


@pytest.mark.django_db
def test_unknown_email_stays_explicit_after_limit(client_with_csrf):
    unknown = f"unknown-{uuid4().hex}@example.edu"
    responses = [
        post(client_with_csrf, REQUEST_URL, {"email": unknown}) for _ in range(4)
    ]

    assert all(response.status_code == 404 for response in responses)
    assert all(response.json() == EMAIL_NOT_FOUND for response in responses)
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_rate_limit_store_failure_sends_no_mail(client_with_csrf, user, caplog):
    unknown = f"unknown-{uuid4().hex}@example.edu"

    with patch("apps.users.password_reset._consume_email_limit", side_effect=ConnectionError), \
         patch("apps.users.password_reset.User.objects.filter", side_effect=AssertionError("DB lookup")):
        existing = post(client_with_csrf, REQUEST_URL, {"email": user.email})
        missing = post(client_with_csrf, REQUEST_URL, {"email": unknown})

    assert existing.status_code == missing.status_code == 429
    assert existing.json() == missing.json() == RESET_REQUEST_LIMITED
    assert len(mail.outbox) == 0
    assert "Password reset rate limiting is unavailable." in caplog.text
    assert user.email not in caplog.text
    assert unknown not in caplog.text


@pytest.mark.django_db
def test_many_students_can_request_from_one_ip():
    users = [
        User.objects.create_user(
            email=f"student-{uuid4().hex}@example.edu",
            password="EveningRivers!8462",
        )
        for _ in range(21)
    ]

    responses = []
    for user in users:
        browser = APIClient(enforce_csrf_checks=True)
        assert browser.get(CSRF_URL, REMOTE_ADDR="10.0.0.1").status_code == 200
        context = (browser, browser.cookies["csrftoken"].value, "10.0.0.1")
        responses.append(request_link(context, user.email))

    assert all(response.json() == REQUEST_CONFIRMATION for response in responses)
    assert len(mail.outbox) == 21


@pytest.mark.django_db
def test_one_browser_is_limited_across_different_addresses(client_with_csrf, user):
    for _ in range(10):
        unknown = f"unknown-{uuid4().hex}@example.edu"
        response = post(client_with_csrf, REQUEST_URL, {"email": unknown})
        assert response.status_code == 404
        assert response.json() == EMAIL_NOT_FOUND

    with patch("apps.users.password_reset.User.objects.filter", side_effect=AssertionError("DB lookup")):
        limited = post(client_with_csrf, REQUEST_URL, {"email": user.email})

    assert limited.status_code == 429
    assert limited.json() == RESET_REQUEST_LIMITED
    assert limited["Cache-Control"] == "no-store"
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_browser_limit_does_not_affect_another_browser_on_same_ip(client_with_csrf, user):
    for _ in range(10):
        unknown = f"unknown-{uuid4().hex}@example.edu"
        assert post(client_with_csrf, REQUEST_URL, {"email": unknown}).status_code == 404

    another = APIClient(enforce_csrf_checks=True)
    assert another.get(CSRF_URL).status_code == 200
    context = (another, another.cookies["csrftoken"].value, client_with_csrf[2])
    response = request_link(context, user.email)

    assert response.json() == REQUEST_CONFIRMATION
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user.email]


@pytest.mark.django_db
def test_global_limit_stops_lookup_before_database_work(client_with_csrf, user):
    with patch("apps.users.password_reset.GLOBAL_REQUEST_LIMIT", 2):
        for _ in range(2):
            unknown = f"unknown-{uuid4().hex}@example.edu"
            assert post(client_with_csrf, REQUEST_URL, {"email": unknown}).status_code == 404

        with patch("apps.users.password_reset.User.objects.filter", side_effect=AssertionError("DB lookup")):
            limited = post(client_with_csrf, REQUEST_URL, {"email": user.email})

    assert limited.status_code == 429
    assert limited.json() == RESET_REQUEST_LIMITED
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_missing_or_altered_browser_cookie_is_rejected(client_with_csrf, user):
    browser, _, _ = client_with_csrf
    with patch("apps.users.password_reset.User.objects.filter", side_effect=AssertionError("DB lookup")):
        del browser.cookies[RESET_BROWSER_COOKIE]
        missing = post(client_with_csrf, REQUEST_URL, {"email": user.email})
        browser.cookies[RESET_BROWSER_COOKIE] = "invalid"
        altered = post(client_with_csrf, REQUEST_URL, {"email": user.email})

    assert missing.status_code == altered.status_code == 429
    assert missing.json() == altered.json() == RESET_REQUEST_LIMITED
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_all_reset_posts_require_csrf(client_with_csrf, user):
    request_link(client_with_csrf, user.email)
    uid, token = link_parts(mail.outbox[0])
    before = len(mail.outbox)

    for url, payload in (
        (REQUEST_URL, {"email": user.email}),
        (VALIDATE_URL, {"uid": uid, "token": token}),
        (CONFIRM_URL, {"uid": uid, "token": token, "new_password": NEW_PASSWORD}),
    ):
        response = post(client_with_csrf, url, payload, csrf=False)
        assert response.status_code == 403

    assert len(mail.outbox) == before
    user.refresh_from_db()
    assert user.check_password("EveningRivers!8462")
