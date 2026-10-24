import jwt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


User = get_user_model()
REFRESH_URL = "/api/v1/auth/token/refresh/"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="student@example.edu",
        password="EveningRivers!8462",
    )


def refresh_with(refresh_token):
    client = APIClient()
    client.cookies["studyforge_refresh"] = refresh_token
    return client.post(REFRESH_URL, {}, format="json")


@pytest.mark.django_db
def test_refresh_rotates_the_cookie_and_keeps_it_out_of_the_body(user):
    first = str(RefreshToken.for_user(user))

    response = refresh_with(first)

    assert response.status_code == 200
    assert set(response.json()) == {"access"}
    cookie = response.cookies["studyforge_refresh"]
    assert cookie.value != first
    assert cookie["httponly"]
    assert cookie["path"] == "/api/v1/auth/"
    assert cookie["samesite"] == "Lax"
    # The new token works for the next refresh.
    assert refresh_with(cookie.value).status_code == 200


@pytest.mark.django_db
def test_reused_refresh_token_signs_out_every_session(user):
    first = str(RefreshToken.for_user(user))
    rotated = refresh_with(first).cookies["studyforge_refresh"].value
    other_device = str(RefreshToken.for_user(user))

    replay = refresh_with(first)

    assert replay.status_code == 401
    assert replay.cookies["studyforge_refresh"]["max-age"] == 0
    assert refresh_with(rotated).status_code == 401
    assert refresh_with(other_device).status_code == 401


@pytest.mark.django_db
def test_reuse_only_signs_out_that_user(user):
    other_user = User.objects.create_user(
        email="classmate@example.edu",
        password="MorningLakes!5173",
    )
    classmate_token = str(RefreshToken.for_user(other_user))
    first = str(RefreshToken.for_user(user))
    refresh_with(first)

    refresh_with(first)

    assert refresh_with(classmate_token).status_code == 200


@pytest.mark.django_db
def test_forged_token_cannot_sign_out_sessions(user):
    first = RefreshToken.for_user(user)
    refresh_with(str(first))
    other_device = str(RefreshToken.for_user(user))
    # Same claims as the used-up token, signed with a key the server never issued.
    forged = jwt.encode(first.payload, "an-attacker-key-the-server-never-issued", algorithm="HS256")

    assert refresh_with(forged).status_code == 401
    assert refresh_with(other_device).status_code == 200
