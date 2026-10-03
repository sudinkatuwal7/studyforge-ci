import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth import get_user_model


User = get_user_model()
ME_URL = "/api/v1/auth/me/"
LOGOUT_URL = "/api/v1/auth/logout/"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="student@example.edu",
        password="EveningRivers!8462",
    )


@pytest.mark.django_db
def test_me_requires_authentication():
    response = APIClient().get(ME_URL)

    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_authenticated_user(user):
    token = RefreshToken.for_user(user).access_token
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get(ME_URL)

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "id": user.pk,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }
    }


@pytest.mark.django_db
def test_logout_blacklists_refresh_token_and_clears_cookie(user):
    refresh = RefreshToken.for_user(user)
    refresh_token = str(refresh)

    client = APIClient()
    client.cookies["studyforge_refresh"] = refresh_token

    response = client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert response.cookies["studyforge_refresh"]["max-age"] == 0

    # Simulate replaying the old refresh token after logout.
    client.cookies["studyforge_refresh"] = refresh_token

    refresh_response = client.post(
        "/api/v1/auth/token/refresh/",
        {},
        format="json",
    )

    assert refresh_response.status_code == 401
@pytest.mark.django_db
def test_refresh_after_user_deletion_returns_401_and_clears_cookie(user):
    refresh_token = str(RefreshToken.for_user(user))
    user.delete()

    client = APIClient()
    client.cookies["studyforge_refresh"] = refresh_token
    response = client.post("/api/v1/auth/token/refresh/", {}, format="json")

    assert response.status_code == 401
    assert response.cookies["studyforge_refresh"]["max-age"] == 0

