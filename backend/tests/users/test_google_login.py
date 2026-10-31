from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from google.auth.exceptions import TransportError
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken


User = get_user_model()
GOOGLE_URL = "/api/v1/auth/google/"
LOGIN_URL = "/api/v1/auth/token/"
REFRESH_URL = "/api/v1/auth/token/refresh/"
ME_URL = "/api/v1/auth/me/"
CLIENT_ID = "studyforge-test.apps.googleusercontent.com"
VERIFY = "apps.users.google.id_token.verify_oauth2_token"


@pytest.fixture(autouse=True)
def google_client_id(settings):
    settings.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID


def google_claims(**overrides):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "110169484474386276334",
        "email": "sam.student@gmail.com",
        "email_verified": True,
        "given_name": "Sam",
        "family_name": "Student",
    }
    claims.update(overrides)
    return claims


def client_with_csrf():
    client = APIClient(enforce_csrf_checks=True)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    return client, client.cookies["csrftoken"].value


def google_sign_in(claims=None, side_effect=None, credential="google-id-token"):
    client, csrf_token = client_with_csrf()
    with patch(VERIFY, return_value=claims, side_effect=side_effect) as verify:
        response = client.post(
            GOOGLE_URL,
            {"credential": credential},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
    return response, verify


def assert_signed_in_as(response, user):
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access", "user"}
    assert body["user"] == {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }
    assert AccessToken(body["access"])["user_id"] == str(user.pk)

    refresh_cookie = response.cookies["studyforge_refresh"]
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["path"] == "/api/v1/auth/"
    assert refresh_cookie["samesite"] == "Lax"
    # The refresh token lives only in the HttpOnly cookie.
    assert refresh_cookie.value not in response.content.decode()


def assert_not_signed_in(response):
    assert "access" not in response.json()
    assert "studyforge_refresh" not in response.cookies


@pytest.mark.django_db
def test_new_google_user_gets_an_account():
    response, verify = google_sign_in(google_claims())

    user = User.objects.get()
    assert user.email == "sam.student@gmail.com"
    assert user.google_sub == "110169484474386276334"
    assert (user.first_name, user.last_name) == ("Sam", "Student")
    assert user.is_active
    assert not user.has_usable_password()
    assert_signed_in_as(response, user)

    verify.assert_called_once()
    assert verify.call_args.args[0] == "google-id-token"
    assert verify.call_args.kwargs["audience"] == CLIENT_ID


@pytest.mark.django_db
def test_new_google_user_email_is_stored_lowercase():
    google_sign_in(google_claims(email="Sam.Student@Gmail.com"))

    assert User.objects.get().email == "sam.student@gmail.com"


@pytest.mark.django_db
def test_returning_google_user_gets_the_same_account():
    first, _ = google_sign_in(google_claims())
    second, _ = google_sign_in(google_claims())

    assert User.objects.count() == 1
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert_signed_in_as(second, User.objects.get())


@pytest.mark.django_db
def test_concurrent_sign_up_of_same_google_account_signs_both_into_one_account():
    # Request A has already committed this user. Request B's lookups ran just
    # before that commit, so they miss, and B's insert hits the unique constraint.
    winner = User.objects.create_user(
        email="sam.student@gmail.com", google_sub="110169484474386276334"
    )
    real_filter = User.objects.filter
    lookups = []

    def filter_racing_with_a(*args, **kwargs):
        lookups.append(kwargs)
        if len(lookups) <= 2:
            return User.objects.none()
        return real_filter(*args, **kwargs)

    with patch.object(User.objects, "filter", side_effect=filter_racing_with_a):
        response, _ = google_sign_in(google_claims())

    # sub lookup, email check, then the sub lookup after the IntegrityError.
    assert [set(kwargs) for kwargs in lookups] == [
        {"google_sub"},
        {"email__iexact"},
        {"google_sub"},
    ]
    assert User.objects.count() == 1
    assert_signed_in_as(response, winner)


@pytest.mark.django_db
def test_changed_google_email_still_reaches_the_account_and_keeps_stored_email():
    google_sign_in(google_claims())

    response, _ = google_sign_in(google_claims(email="sam.renamed@gmail.com"))

    user = User.objects.get()
    assert user.email == "sam.student@gmail.com"
    assert_signed_in_as(response, user)


@pytest.mark.django_db
def test_changed_google_email_matching_another_account_still_reaches_own_account():
    google_sign_in(google_claims())
    other = User.objects.create_user(
        email="taken@example.edu", password="EveningRivers!8462"
    )

    response, _ = google_sign_in(google_claims(email="taken@example.edu"))

    assert User.objects.count() == 2
    assert response.json()["user"]["id"] != other.pk
    assert_signed_in_as(response, User.objects.get(google_sub="110169484474386276334"))


@pytest.mark.django_db
@pytest.mark.parametrize("email", ["sam.student@gmail.com", "SAM.Student@gmail.com"])
def test_email_of_existing_password_account_is_refused_not_linked(email):
    existing = User.objects.create_user(
        email="sam.student@gmail.com", password="EveningRivers!8462"
    )

    response, _ = google_sign_in(google_claims(email=email))

    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists."}
    assert_not_signed_in(response)
    assert User.objects.count() == 1
    existing.refresh_from_db()
    assert existing.google_sub is None
    assert existing.check_password("EveningRivers!8462")


@pytest.mark.django_db
def test_recreated_google_account_cannot_take_over_old_account():
    google_sign_in(google_claims())

    response, _ = google_sign_in(google_claims(sub="999999999999999999999"))

    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists."}
    assert_not_signed_in(response)
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_inactive_linked_account_is_refused_as_deactivated():
    google_sign_in(google_claims())
    User.objects.update(is_active=False)

    response, _ = google_sign_in(google_claims())

    assert response.status_code == 403
    assert response.json() == {"detail": "This account has been deactivated."}
    assert_not_signed_in(response)


@pytest.mark.django_db
def test_inactive_account_matched_by_email_gets_the_generic_409():
    User.objects.create_user(
        email="sam.student@gmail.com", password="EveningRivers!8462", is_active=False
    )

    response, _ = google_sign_in(google_claims())

    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists."}
    assert_not_signed_in(response)


@pytest.mark.django_db
def test_deactivating_a_google_user_ends_their_session():
    response, _ = google_sign_in(google_claims())
    access = response.json()["access"]
    refresh = response.cookies["studyforge_refresh"].value
    User.objects.update(is_active=False)

    me_client = APIClient()
    me_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    refresh_client = APIClient()
    refresh_client.cookies["studyforge_refresh"] = refresh

    assert me_client.get(ME_URL).status_code == 401
    assert refresh_client.post(REFRESH_URL, {}, format="json").status_code == 401


@pytest.mark.django_db
def test_google_session_refreshes_and_reads_profile_like_password_session():
    response, _ = google_sign_in(google_claims())
    user = User.objects.get()

    client = APIClient()
    client.cookies["studyforge_refresh"] = response.cookies["studyforge_refresh"].value
    refreshed = client.post(REFRESH_URL, {}, format="json")
    assert refreshed.status_code == 200

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refreshed.json()['access']}")
    me = client.get(ME_URL)
    assert me.status_code == 200
    assert me.json()["user"]["id"] == user.pk


@pytest.mark.django_db
@pytest.mark.parametrize(
    "side_effect",
    [
        ValueError("Token used too late"),
        ValueError("Wrong recipient, payload audience != requested audience"),
        ValueError("Wrong issuer"),
        ValueError("Could not verify token signature."),
    ],
)
def test_rejected_google_token_gets_generic_401(side_effect):
    response, _ = google_sign_in(side_effect=side_effect)

    assert response.status_code == 401
    assert response.json() == {"detail": "Google sign-in failed."}
    assert_not_signed_in(response)
    assert User.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "claims",
    [
        google_claims(email_verified=False),
        google_claims(email_verified="true"),
        {key: value for key, value in google_claims().items() if key != "email_verified"},
        google_claims(sub=""),
        google_claims(email=""),
    ],
)
def test_unverified_or_incomplete_google_identity_gets_generic_401(claims):
    response, _ = google_sign_in(claims)

    assert response.status_code == 401
    assert response.json() == {"detail": "Google sign-in failed."}
    assert_not_signed_in(response)
    assert User.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("credential", ["", "   "])
def test_missing_credential_is_a_bad_request(credential):
    response, verify = google_sign_in(credential=credential)

    assert response.status_code == 400
    assert "credential" in response.json()
    verify.assert_not_called()


@pytest.mark.django_db
def test_google_sign_in_requires_csrf():
    client, _csrf_token = client_with_csrf()

    with patch(VERIFY, return_value=google_claims()) as verify:
        response = client.post(GOOGLE_URL, {"credential": "google-id-token"}, format="json")

    assert response.status_code == 403
    verify.assert_not_called()
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_google_sign_in_is_refused_when_not_configured(settings):
    settings.GOOGLE_OAUTH_CLIENT_ID = ""

    response, verify = google_sign_in(google_claims())

    assert response.status_code == 503
    assert response.json() == {"detail": "Google sign-in is not available right now."}
    assert_not_signed_in(response)
    verify.assert_not_called()
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_unreachable_google_keys_are_reported_as_unavailable():
    response, _ = google_sign_in(side_effect=TransportError("connection refused"))

    assert response.status_code == 503
    assert_not_signed_in(response)


@pytest.mark.django_db
@pytest.mark.parametrize("password", ["", "!", "google-id-token"])
def test_google_only_user_cannot_use_password_login(password):
    google_sign_in(google_claims())
    client, csrf_token = client_with_csrf()

    response = client.post(
        LOGIN_URL,
        {"email": "sam.student@gmail.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert response.status_code in (400, 401)
    assert "access" not in response.json()


@pytest.mark.django_db
def test_password_login_still_works_alongside_google_users():
    google_sign_in(google_claims())
    password = "EveningRivers!8462"
    user = User.objects.create_user(email="student@example.edu", password=password)
    client, csrf_token = client_with_csrf()

    response = client.post(
        LOGIN_URL,
        {"email": user.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == user.pk


@pytest.mark.django_db
def test_inactive_password_user_cannot_log_in():
    password = "EveningRivers!8462"
    User.objects.create_user(
        email="student@example.edu", password=password, is_active=False
    )
    client, csrf_token = client_with_csrf()

    response = client.post(
        LOGIN_URL,
        {"email": "student@example.edu", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert response.status_code == 401
    assert "access" not in response.json()


GOOGLE_FAILURES = {
    "rejected token": (401, {"side_effect": ValueError("Token used too late")}),
    "unverified email": (401, {"claims": {"email_verified": False}}),
    "deactivated account": (403, {"claims": {"sub": "deactivated-sub"}}),
    "email taken": (409, {"claims": {"email": "taken@example.edu"}}),
    "google unreachable": (503, {"side_effect": TransportError("connection refused")}),
}


@pytest.mark.django_db
@pytest.mark.parametrize("failure", GOOGLE_FAILURES, ids=str)
def test_failed_google_sign_in_leaves_an_existing_session_working(failure):
    expected_status, setup = GOOGLE_FAILURES[failure]
    User.objects.create_user(email="taken@example.edu", password="EveningRivers!8462")
    User.objects.create_user(
        email="off@gmail.com", google_sub="deactivated-sub", is_active=False
    )
    signed_in = User.objects.create_user(
        email="student@example.edu", password="EveningRivers!8462"
    )
    client, csrf_token = client_with_csrf()
    login = client.post(
        LOGIN_URL,
        {"email": signed_in.email, "password": "EveningRivers!8462"},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    assert login.status_code == 200
    session_cookie = client.cookies["studyforge_refresh"].value
    claims = google_claims(**setup.get("claims", {}))

    with patch(VERIFY, return_value=claims, side_effect=setup.get("side_effect")):
        response = client.post(
            GOOGLE_URL,
            {"credential": "google-id-token"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

    assert response.status_code == expected_status
    assert_not_signed_in(response)
    # The browser keeps the old cookie, and it still belongs to the same user.
    assert client.cookies["studyforge_refresh"].value == session_cookie
    refreshed = client.post(REFRESH_URL, {}, format="json", HTTP_X_CSRFTOKEN=csrf_token)
    assert refreshed.status_code == 200
    assert AccessToken(refreshed.json()["access"])["user_id"] == str(signed_in.pk)
