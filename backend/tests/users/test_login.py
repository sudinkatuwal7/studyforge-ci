import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken


User = get_user_model()
LOGIN_URL = "/api/v1/auth/token/"


def client_with_csrf():
    client = APIClient(enforce_csrf_checks=True)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    return client, client.cookies["csrftoken"].value


@pytest.mark.django_db
def test_valid_login_returns_access_token_and_refresh_cookie():
    password = "EveningRivers!8462"
    user = User.objects.create_user(
        email="student@example.edu",
        password=password,
    )
    client, csrf_token = client_with_csrf()

    response = client.post(
        LOGIN_URL,
        {"email": user.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access", "user"}
    assert body["user"]["id"] == user.pk
    assert AccessToken(body["access"])["user_id"] == str(user.pk)

    refresh_cookie = response.cookies["studyforge_refresh"]
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["path"] == "/api/v1/auth/"
    assert refresh_cookie["samesite"] == "Lax"


@pytest.mark.django_db
def test_invalid_credentials_have_the_same_error():
    User.objects.create_user(
        email="student@example.edu",
        password="EveningRivers!8462",
    )
    client, csrf_token = client_with_csrf()

    wrong_password = client.post(
        LOGIN_URL,
        {"email": "student@example.edu", "password": "wrong-password"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    unknown_email = client.post(
        LOGIN_URL,
        {"email": "absent@example.edu", "password": "EveningRivers!8462"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert "studyforge_refresh" not in client.cookies


@pytest.mark.django_db
def test_login_rejects_missing_csrf_header():
    client, _csrf_token = client_with_csrf()

    response = client.post(
        LOGIN_URL,
        {"email": "student@example.edu", "password": "EveningRivers!8462"},
        format="json",
    )

    assert response.status_code == 403