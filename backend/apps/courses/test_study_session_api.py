import uuid
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import Course, StudySession


class StudySessionAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.student = User.objects.create_user(email="calendar-a@example.test")
        cls.other = User.objects.create_user(email="calendar-b@example.test")
        cls.course = Course.objects.create(owner=cls.student, name="Algorithms")
        cls.other_course = Course.objects.create(owner=cls.other, name="Private course")
        cls.session = StudySession.objects.create(
            course=cls.course, title="Graphs", date=date(2026, 10, 20), time=time(14, 30)
        )
        cls.other_session = StudySession.objects.create(
            course=cls.other_course, title="Private session", date=date(2026, 10, 21)
        )
        cls.list_url = reverse("study-session-list-create")

    def setUp(self):
        self.authenticate(self.student)
        self.payload = {
            "creation_key": str(uuid.uuid4()),
            "title": "  Review recursion  ",
            "course": self.course.pk,
            "date": "2026-10-22",
            "time": "09:30",
        }

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def detail_url(self, session_id):
        return reverse("study-session-detail", kwargs={"session_id": session_id})

    def test_create_persists_session_and_returns_public_fields(self):
        response = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(response.status_code, 201)
        saved = StudySession.objects.get(pk=response.data["id"])
        self.assertEqual(saved.title, "Review recursion")
        self.assertEqual(saved.course_id, self.course.pk)
        self.assertEqual(saved.date, date(2026, 10, 22))
        self.assertEqual(saved.time, time(9, 30))
        self.assertEqual(saved.creation_key, uuid.UUID(self.payload["creation_key"]))
        self.assertEqual(set(response.data), {
            "id", "title", "course", "date", "time", "created_at", "updated_at"
        })
        self.assertEqual(response.data["date"], "2026-10-22")
        self.assertEqual(response.data["time"], "09:30:00")

    def test_creation_allows_omitted_or_null_time(self):
        for optional_time in ({}, {"time": None}):
            with self.subTest(optional_time=optional_time):
                payload = {key: value for key, value in self.payload.items() if key != "time"}
                payload.update(optional_time, creation_key=str(uuid.uuid4()))
                response = self.client.post(self.list_url, payload, format="json")
                self.assertEqual(response.status_code, 201)
                self.assertIsNone(response.data["time"])
                self.assertIsNone(StudySession.objects.get(pk=response.data["id"]).time)

    def test_list_is_scoped_to_each_student(self):
        second_course = Course.objects.create(owner=self.student, name="Networks")
        extra = StudySession.objects.create(
            course=second_course, title="Protocols", date=date(2026, 10, 23)
        )
        for user, expected in (
            (self.student, {self.session.pk, extra.pk}),
            (self.other, {self.other_session.pk}),
        ):
            with self.subTest(user=user.pk):
                self.authenticate(user)
                response = self.client.get(self.list_url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual({item["id"] for item in response.data}, expected)

    def test_list_orders_by_date_then_untimed_then_time_then_id(self):
        untimed = StudySession.objects.create(
            course=self.course, title="Untimed", date=self.session.date
        )
        morning = StudySession.objects.create(
            course=self.course, title="Morning", date=self.session.date, time=time(8)
        )
        same_time = StudySession.objects.create(
            course=self.course, title="Same time", date=self.session.date, time=self.session.time
        )
        earlier = StudySession.objects.create(
            course=self.course, title="Earlier date", date=date(2026, 10, 19), time=time(23)
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data],
            [earlier.pk, untimed.pk, morning.pk, self.session.pk, same_time.pk],
        )

    def test_empty_list_and_owned_detail(self):
        response = self.client.get(self.detail_url(self.session.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Graphs")
        self.assertNotIn("creation_key", response.data)
        self.session.delete()
        self.assertEqual(self.client.get(self.list_url).data, [])

    def test_patch_preserves_omitted_fields_and_updates_timestamp(self):
        old_timestamp = timezone.now() - timedelta(days=1)
        StudySession.objects.filter(pk=self.session.pk).update(updated_at=old_timestamp)
        original_key = self.session.creation_key
        original_created_at = self.session.created_at
        response = self.client.patch(
            self.detail_url(self.session.pk), {"title": "  Updated graphs  "}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.title, "Updated graphs")
        self.assertEqual(self.session.course_id, self.course.pk)
        self.assertEqual(self.session.date, date(2026, 10, 20))
        self.assertEqual(self.session.time, time(14, 30))
        self.assertEqual(self.session.creation_key, original_key)
        self.assertEqual(self.session.created_at, original_created_at)
        self.assertGreater(self.session.updated_at, old_timestamp)

    def test_patch_can_change_course_date_and_clear_time(self):
        course = Course.objects.create(owner=self.student, name="Networks")
        response = self.client.patch(
            self.detail_url(self.session.pk),
            {"course": course.pk, "date": "2026-10-25", "time": None}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.course_id, course.pk)
        self.assertEqual(self.session.date, date(2026, 10, 25))
        self.assertIsNone(self.session.time)
        response = self.client.patch(
            self.detail_url(self.session.pk), {"time": "16:45"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.time, time(16, 45))

    def test_delete_removes_only_owned_session(self):
        response = self.client.delete(self.detail_url(self.session.pk))
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertFalse(StudySession.objects.filter(pk=self.session.pk).exists())
        self.assertTrue(StudySession.objects.filter(pk=self.other_session.pk).exists())
        self.assertTrue(Course.objects.filter(pk=self.course.pk).exists())
        self.assertEqual(self.client.delete(self.detail_url(self.session.pk)).status_code, 404)

    def test_foreign_missing_and_out_of_range_ids_return_404_for_all_detail_operations(self):
        missing = max(self.session.pk, self.other_session.pk) + 1
        for session_id in (self.other_session.pk, missing, 0, 9223372036854775808):
            for method in ("get", "patch", "delete"):
                with self.subTest(session_id=session_id, method=method):
                    kwargs = {"data": {"title": "Changed"}, "format": "json"} if method == "patch" else {}
                    response = getattr(self.client, method)(self.detail_url(session_id), **kwargs)
                    self.assertEqual(response.status_code, 404)
        self.other_session.refresh_from_db()
        self.assertEqual(self.other_session.title, "Private session")

    def test_invalid_create_and_update_leave_database_unchanged(self):
        initial_count = StudySession.objects.count()
        invalid_fields = (
            {"course": self.other_course.pk}, {"course": 0},
            {"title": "   "}, {"title": "x" * 201},
            {"date": "2026-02-30"}, {"date": None}, {"time": "25:00"},
            {"owner": self.other.pk}, {"id": 500}, {"created_at": "2020-01-01"},
            {"updated_at": "2020-01-01"}, {"unexpected": True},
        )
        for invalid in invalid_fields:
            with self.subTest(invalid=invalid):
                created = self.client.post(self.list_url, {**self.payload, **invalid}, format="json")
                updated = self.client.patch(self.detail_url(self.session.pk), invalid, format="json")
                self.assertEqual(created.status_code, 400)
                self.assertEqual(updated.status_code, 400)
                self.assertIn(next(iter(invalid)), created.data)
                self.assertIn(next(iter(invalid)), updated.data)
        self.assertEqual(StudySession.objects.count(), initial_count)
        self.session.refresh_from_db()
        self.assertEqual(self.session.title, "Graphs")
        self.assertEqual(self.session.course_id, self.course.pk)

    def test_creation_requires_valid_key_and_updates_cannot_change_it(self):
        for key_fields in ({}, {"creation_key": "invalid"}):
            payload = {key: value for key, value in self.payload.items() if key != "creation_key"}
            response = self.client.post(self.list_url, {**payload, **key_fields}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("creation_key", response.data)
        response = self.client.patch(
            self.detail_url(self.session.pk), {"creation_key": str(uuid.uuid4())}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_matching_retry_returns_existing_session(self):
        first = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(first.status_code, 201)
        count = StudySession.objects.count()
        retried = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.data, first.data)
        self.assertEqual(StudySession.objects.count(), count)

    def test_conflicting_retry_returns_409_without_mutation(self):
        first = self.client.post(self.list_url, self.payload, format="json")
        self.assertEqual(first.status_code, 201)
        count = StudySession.objects.count()
        course = Course.objects.create(owner=self.student, name="Networks")
        for changes in (
            {"title": "Different"}, {"date": "2026-10-23"},
            {"time": None}, {"course": course.pk},
        ):
            with self.subTest(changes=changes):
                response = self.client.post(self.list_url, {**self.payload, **changes}, format="json")
                self.assertEqual(response.status_code, 409)
                self.assertEqual(set(response.data), {"detail"})
        self.assertEqual(StudySession.objects.count(), count)
        self.assertEqual(self.client.get(self.detail_url(first.data["id"])).data, first.data)

    def test_another_students_creation_key_does_not_expose_their_session(self):
        response = self.client.post(
            self.list_url,
            {**self.payload, "creation_key": str(self.other_session.creation_key)}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(set(response.data), {"detail"})
        self.assertNotIn("Private session", str(response.data))
        self.other_session.refresh_from_db()
        self.assertEqual(self.other_session.course_id, self.other_course.pk)

    def test_owned_course_cannot_be_used_to_take_over_a_foreign_session(self):
        # An attacker must not gain access by changing the victim's course to their own.
        original_updated_at = self.other_session.updated_at
        response = self.client.patch(
            self.detail_url(self.other_session.pk),
            {"course": self.course.pk, "title": "Claimed session"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.other_session.refresh_from_db()
        self.assertEqual(self.other_session.course_id, self.other_course.pk)
        self.assertEqual(self.other_session.title, "Private session")
        self.assertEqual(self.other_session.updated_at, original_updated_at)

    def test_query_parameters_cannot_override_authenticated_ownership(self):
        # User and course IDs in the URL cannot replace the identity from the JWT.
        spoofed = {"owner": self.other.pk, "user": self.other.pk, "course": self.other_course.pk}
        response = self.client.get(self.list_url, spoofed)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.session.pk])
        response = self.client.get(
            self.detail_url(self.other_session.pk), {"owner": self.student.pk}
        )
        self.assertEqual(response.status_code, 404)

    def test_tokens_from_deactivated_or_deleted_users_are_rejected(self):
        User = get_user_model()
        inactive = User.objects.create_user(email="calendar-inactive@example.test")
        deleted = User.objects.create_user(email="calendar-deleted@example.test")
        # Issue valid tokens first, then revoke access through the account's state.
        inactive_token = str(AccessToken.for_user(inactive))
        deleted_token = str(AccessToken.for_user(deleted))
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])
        deleted.delete()
        initial_count = StudySession.objects.count()
        for token in (inactive_token, deleted_token):
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            for method, url, payload in (
                ("get", self.list_url, None),
                ("post", self.list_url, self.payload),
                ("get", self.detail_url(self.session.pk), None),
                ("patch", self.detail_url(self.session.pk), {"title": "Changed"}),
                ("delete", self.detail_url(self.session.pk), None),
            ):
                with self.subTest(token=token, method=method, url=url):
                    kwargs = {"data": payload, "format": "json"} if payload is not None else {}
                    response = getattr(self.client, method)(url, **kwargs)
                    self.assertEqual(response.status_code, 401)
        self.assertEqual(StudySession.objects.count(), initial_count)
        self.session.refresh_from_db()
        self.assertEqual(self.session.title, "Graphs")

    def test_all_endpoints_reject_missing_invalid_and_expired_tokens(self):
        expired = AccessToken.for_user(self.student)
        expired.set_exp(lifetime=timedelta(minutes=-5))
        initial_count = StudySession.objects.count()
        for token in (None, "invalid-token", str(expired)):
            self.client.credentials(**({"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}))
            for method, url, payload in (
                ("get", self.list_url, None),
                ("post", self.list_url, self.payload),
                ("get", self.detail_url(self.session.pk), None),
                ("patch", self.detail_url(self.session.pk), {"title": "Changed"}),
                ("delete", self.detail_url(self.session.pk), None),
            ):
                with self.subTest(token=token, method=method, url=url):
                    kwargs = {"data": payload, "format": "json"} if payload is not None else {}
                    response = getattr(self.client, method)(url, **kwargs)
                    self.assertEqual(response.status_code, 401)
        self.assertEqual(StudySession.objects.count(), initial_count)
        self.session.refresh_from_db()
        self.assertEqual(self.session.title, "Graphs")
