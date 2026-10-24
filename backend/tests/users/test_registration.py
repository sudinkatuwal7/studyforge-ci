import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


REGISTER_URL = "/api/v1/auth/register/"
User = get_user_model()


@pytest.mark.django_db
def test_registration_creates_user_with_hashed_password():
    password = "EveningRivers!8462"

    response = APIClient().post(
        REGISTER_URL,
        {
            "email": "Student@Example.edu",
            "password": password,
            "first_name": "Sam",
            "last_name": "Student",
        },
        format="json",
    )

    assert response.status_code == 201
    user = User.objects.get(email="student@example.edu")
    assert user.check_password(password)
    assert user.password != password
    assert response.json() == {
        "user": {
            "id": user.pk,
            "email": "student@example.edu",
            "first_name": "Sam",
            "last_name": "Student",
        }
    }


@pytest.mark.django_db
def test_registration_rejects_duplicate_email_ignoring_case():
    User.objects.create_user(
        email="student@example.edu",
        password="EveningRivers!8462",
    )

    response = APIClient().post(
        REGISTER_URL,
        {
            "email": "STUDENT@example.edu",
            "password": "AnotherRiver!8462",
            "first_name": "Sam",
            "last_name": "Student",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "email" in response.json()
    assert User.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("email", "password", "error_field"),
    [
        ("not-an-email", "EveningRivers!8462", "email"),
        ("new@example.edu", "123", "password"),
    ],
)
def test_registration_returns_field_errors(email, password, error_field):
    response = APIClient().post(
        REGISTER_URL,
        {
            "email": email,
            "password": password,
            "first_name": "Sam",
            "last_name": "Student",
        },
        format="json",
    )

    assert response.status_code == 400
    assert error_field in response.json()
    assert User.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("first_name", None),
        ("last_name", None),
        ("first_name", "   "),
        ("last_name", ""),
    ],
)
def test_registration_requires_first_and_last_name(field, value):
    payload = {
        "email": "new@example.edu",
        "password": "EveningRivers!8462",
        "first_name": "Sam",
        "last_name": "Student",
    }
    if value is None:
        del payload[field]
    else:
        payload[field] = value

    response = APIClient().post(REGISTER_URL, payload, format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert User.objects.count() == 0
