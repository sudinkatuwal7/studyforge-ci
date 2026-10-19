import uuid
from datetime import date, time
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from .models import Course, StudySession
from .serializers import StudySessionCreateSerializer, StudySessionSerializer


class StudySessionSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.student = User.objects.create_user(email="session-a@example.test")
        other = User.objects.create_user(email="session-b@example.test")
        cls.course = Course.objects.create(owner=cls.student, name="Algorithms")
        cls.other_course = Course.objects.create(owner=other, name="Private course")
        cls.session = StudySession.objects.create(
            title="Review graphs", course=cls.course, date=date(2026, 10, 20), time=time(14, 30)
        )

    def setUp(self):
        self.context = {"request": SimpleNamespace(user=self.student)}
        self.payload = {
            "creation_key": str(uuid.uuid4()),
            "title": "  Review recursion  ",
            "course": self.course.pk,
            "date": "2026-10-21",
        }

    def test_create_saves_valid_data_and_hides_creation_key(self):
        serializer = StudySessionCreateSerializer(
            data={**self.payload, "time": "14:30"}, context=self.context
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        saved = serializer.save()
        saved.refresh_from_db()
        self.assertEqual(saved.title, "Review recursion")
        self.assertEqual(saved.course_id, self.course.pk)
        self.assertEqual(saved.date, date(2026, 10, 21))
        self.assertEqual(saved.time, time(14, 30))
        self.assertEqual(saved.creation_key, uuid.UUID(self.payload["creation_key"]))
        self.assertEqual(set(serializer.data), {
            "id", "title", "course", "date", "time", "created_at", "updated_at"
        })
        self.assertEqual(serializer.data["time"], "14:30:00")

    def test_time_can_be_omitted_or_null(self):
        for optional_time in ({}, {"time": None}):
            with self.subTest(optional_time=optional_time):
                serializer = StudySessionCreateSerializer(
                    data={**self.payload, **optional_time, "creation_key": str(uuid.uuid4())},
                    context=self.context,
                )
                self.assertTrue(serializer.is_valid(), serializer.errors)
                self.assertIsNone(serializer.save().time)

    def test_required_fields_cannot_be_omitted(self):
        for field in ("title", "course", "date", "creation_key"):
            with self.subTest(field=field):
                payload = self.payload.copy()
                del payload[field]
                serializer = StudySessionCreateSerializer(data=payload, context=self.context)
                self.assertFalse(serializer.is_valid())
                self.assertIn(field, serializer.errors)

    def test_invalid_field_values_are_rejected(self):
        invalid_values = {
            "title": ["", " \t\n", "a" * 201, None],
            "date": ["2026-02-30", "not-a-date", "", None],
            "time": ["24:00", "14:60", "14:30+02:00", ""],
            "creation_key": ["not-a-uuid", "", None],
            "course": [self.other_course.pk, 0, 9223372036854775808, None],
        }
        for field, values in invalid_values.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    serializer = StudySessionCreateSerializer(
                        data={**self.payload, field: value}, context=self.context
                    )
                    self.assertFalse(serializer.is_valid())
                    self.assertIn(field, serializer.errors)

    def test_past_dates_and_leap_days_are_allowed(self):
        serializer = StudySessionCreateSerializer(
            data={**self.payload, "date": "2024-02-29", "time": "00:00:00"},
            context=self.context,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["date"], date(2024, 2, 29))
        self.assertEqual(serializer.validated_data["time"], time(0, 0))

    def test_no_course_is_available_without_authenticated_context(self):
        for context in ({}, {"request": SimpleNamespace(user=AnonymousUser())}):
            with self.subTest(context=context):
                serializer = StudySessionCreateSerializer(data=self.payload, context=context)
                self.assertFalse(serializer.is_valid())
                self.assertIn("course", serializer.errors)

    def test_partial_update_preserves_omitted_values_and_creation_key(self):
        original_key = self.session.creation_key
        original_created_at = self.session.created_at
        serializer = StudySessionSerializer(
            self.session, data={"title": "Updated title"}, partial=True, context=self.context
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.session.refresh_from_db()
        self.assertEqual(self.session.title, "Updated title")
        self.assertEqual(self.session.date, date(2026, 10, 20))
        self.assertEqual(self.session.time, time(14, 30))
        self.assertEqual(self.session.creation_key, original_key)
        self.assertEqual(self.session.created_at, original_created_at)

    def test_update_can_change_owned_course_date_and_clear_time(self):
        course = Course.objects.create(owner=self.student, name="Networks")
        serializer = StudySessionSerializer(
            self.session,
            data={"course": course.pk, "date": "2026-10-22", "time": None},
            partial=True,
            context=self.context,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.session.refresh_from_db()
        self.assertEqual(self.session.course_id, course.pk)
        self.assertEqual(self.session.date, date(2026, 10, 22))
        self.assertIsNone(self.session.time)

    def test_update_cannot_move_session_to_another_students_course(self):
        serializer = StudySessionSerializer(
            self.session, data={"course": self.other_course.pk}, partial=True, context=self.context
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("course", serializer.errors)
        self.session.refresh_from_db()
        self.assertEqual(self.session.course_id, self.course.pk)

    def test_unsupported_and_read_only_input_is_rejected(self):
        for field in ("owner", "id", "created_at", "updated_at", "unexpected"):
            with self.subTest(field=field):
                create = StudySessionCreateSerializer(
                    data={**self.payload, field: "untrusted"}, context=self.context
                )
                update = StudySessionSerializer(
                    self.session, data={field: "untrusted"}, partial=True, context=self.context
                )
                for serializer in (create, update):
                    self.assertFalse(serializer.is_valid())
                    self.assertIn(field, serializer.errors)

    def test_update_rejects_creation_key(self):
        serializer = StudySessionSerializer(
            self.session,
            data={"creation_key": str(uuid.uuid4())},
            partial=True,
            context=self.context,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("creation_key", serializer.errors)

    def test_non_object_payload_is_rejected(self):
        serializer = StudySessionCreateSerializer(data=[], context=self.context)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_existing_creation_key_is_left_for_view_retry_handling(self):
        serializer = StudySessionCreateSerializer(
            data={**self.payload, "creation_key": str(self.session.creation_key)},
            context=self.context,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
