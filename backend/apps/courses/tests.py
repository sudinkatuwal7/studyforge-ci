"""SCRUM-35: verify course creation and ownership through the real API."""

import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import Course, TodoItem


class CourseAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Two students let us check that one cannot see the other's courses.
        User = get_user_model()
        cls.student_a = User.objects.create_user(email="student-a@example.test")
        cls.student_b = User.objects.create_user(email="student-b@example.test")
        cls.course_a = Course.objects.create(
            owner=cls.student_a, name="Algorithms", description="Lecture notes"
        )
        cls.course_b = Course.objects.create(owner=cls.student_b, name="Databases")
        cls.list_url = reverse("course-create")

    def setUp(self):
        # Each test starts authenticated as Student A and gets isolated DB changes.
        self.authenticate(self.student_a)

    def authenticate(self, user):
        # Send a real JWT header, so the API's authentication code is exercised.
        token = AccessToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def detail_url(self, course_id):
        return reverse("course-detail", kwargs={"course_id": course_id})

    def test_valid_course_is_created_and_saved_for_logged_in_student(self):
        initial_count = Course.objects.count()
        response = self.client.post(
            self.list_url,
            {"name": "Operating Systems", "description": "Processes and memory"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Course.objects.count(), initial_count + 1)
        # Check the actual database row as well as the API response.
        course = Course.objects.get(pk=response.data["id"])
        self.assertEqual(course.name, "Operating Systems")
        self.assertEqual(course.description, "Processes and memory")
        self.assertEqual(course.owner_id, self.student_a.pk)
        self.assertEqual(response.data["name"], course.name)
        self.assertEqual(response.data["description"], course.description)
        self.assertEqual(response.data["owner"], self.student_a.pk)

    def test_description_is_optional(self):
        response = self.client.post(self.list_url, {"name": "Calculus"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        course = Course.objects.get(pk=response.data["id"])
        self.assertEqual(course.description, "")
        self.assertEqual(course.owner_id, self.student_a.pk)

    def test_student_cannot_assign_new_course_to_another_owner(self):
        # An owner supplied by the browser must not override the logged-in user.
        response = self.client.post(
            self.list_url,
            {"name": "Networks", "owner": self.student_b.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        course = Course.objects.get(pk=response.data["id"])
        self.assertEqual(course.owner_id, self.student_a.pk)
        self.assertEqual(response.data["owner"], self.student_a.pk)

    def test_missing_blank_and_whitespace_names_do_not_create_courses(self):
        initial_count = Course.objects.count()
        for payload in ({}, {"name": ""}, {"name": "   "}, {"name": "\t\n"}):
            with self.subTest(payload=payload):
                response = self.client.post(self.list_url, payload, format="json")

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("name", response.data)
                self.assertEqual(Course.objects.count(), initial_count)

    def assert_course_requests_are_unauthorized(self):
        initial_count = Course.objects.count()
        requests = (
            ("get", self.list_url, {}),
            ("post", self.list_url, {"data": {"name": "Unauthorized"}, "format": "json"}),
            ("get", self.detail_url(self.course_a.pk), {}),
        )
        for method, url, kwargs in requests:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, **kwargs)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Course.objects.count(), initial_count)

    def test_course_requests_require_authentication(self):
        self.client.credentials()
        self.assert_course_requests_are_unauthorized()

    def test_invalid_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")
        self.assert_course_requests_are_unauthorized()

    def test_each_student_lists_only_their_own_courses(self):
        extra_course = Course.objects.create(owner=self.student_a, name="Networks")
        for student, expected_ids in (
            (self.student_a, {self.course_a.pk, extra_course.pk}),
            (self.student_b, {self.course_b.pk}),
        ):
            with self.subTest(student=student.email):
                self.authenticate(student)
                response = self.client.get(self.list_url)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual({course["id"] for course in response.data}, expected_ids)
                self.assertTrue(all(course["owner"] == student.pk for course in response.data))

    def test_student_with_no_courses_gets_empty_list(self):
        # Student B still has a course, but it must not appear for Student A.
        self.course_a.delete()
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_student_can_open_their_own_course(self):
        response = self.client.get(self.detail_url(self.course_a.pk))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.course_a.pk)
        self.assertEqual(response.data["name"], self.course_a.name)
        self.assertEqual(response.data["description"], self.course_a.description)
        self.assertEqual(response.data["owner"], self.student_a.pk)

    def test_other_students_course_is_hidden_like_a_missing_course(self):
        missing_id = max(self.course_a.pk, self.course_b.pk) + 1
        for student, private_course in (
            (self.student_a, self.course_b),
            (self.student_b, self.course_a),
        ):
            with self.subTest(student=student.email):
                self.authenticate(student)
                private = self.client.get(self.detail_url(private_course.pk))
                missing = self.client.get(self.detail_url(missing_id))

                self.assertEqual(private.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
                # Matching errors avoid revealing that another student's course exists.
                self.assertEqual(private.data, missing.data)


class TodoAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.student_a = User.objects.create_user(email="todo-a@example.test")
        cls.student_b = User.objects.create_user(email="todo-b@example.test")
        cls.course_a = Course.objects.create(owner=cls.student_a, name="Algorithms")
        cls.course_b = Course.objects.create(owner=cls.student_b, name="Databases")
        cls.todo_a = TodoItem.objects.create(course=cls.course_a, title="Read chapter 1")
        cls.todo_b = TodoItem.objects.create(course=cls.course_b, title="Private task")
        cls.list_url = reverse("todo-list-create")

    def setUp(self):
        self.authenticate(self.student_a)

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def detail_url(self, todo_id):
        return reverse("todo-completion", kwargs={"todo_id": todo_id})

    def test_create_saves_title_course_date_and_default_completion(self):
        response = self.client.post(
            self.list_url,
            {
                "title": "  Finish homework  ",
                "course": self.course_a.pk,
                "due_date": "2026-10-20",
                "creation_key": str(uuid.uuid4()),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        todo = TodoItem.objects.get(pk=response.data["id"])
        self.assertEqual(todo.title, "Finish homework")
        self.assertEqual(todo.course_id, self.course_a.pk)
        self.assertEqual(todo.due_date.isoformat(), "2026-10-20")
        self.assertFalse(todo.is_completed)
        self.assertIsNotNone(todo.created_at)
        listing = self.client.get(self.list_url)
        self.assertIn(response.data, listing.data)

    def test_due_date_can_be_omitted_or_null(self):
        for extra in ({}, {"due_date": None}):
            with self.subTest(extra=extra):
                response = self.client.post(
                    self.list_url,
                    {
                        "title": "Study",
                        "course": self.course_a.pk,
                        "creation_key": str(uuid.uuid4()),
                        **extra,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertIsNone(TodoItem.objects.get(pk=response.data["id"]).due_date)

    def test_invalid_create_data_does_not_save(self):
        valid = {"title": "Study", "course": self.course_a.pk}
        payloads = [
            {"course": self.course_a.pk},
            {"title": "Study"},
            *({**valid, "title": title} for title in ("", "   ", "x" * 201)),
            {**valid, "due_date": "2026-02-30"},
            {**valid, "due_date": "not-a-date"},
            {**valid, "course": None},
        ]
        initial_count = TodoItem.objects.count()
        for payload in payloads:
            with self.subTest(payload=payload):
                response = self.client.post(self.list_url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(TodoItem.objects.count(), initial_count)

    def test_cannot_create_for_another_students_or_missing_course(self):
        initial_count = TodoItem.objects.count()
        for course_id in (self.course_b.pk, max(self.course_a.pk, self.course_b.pk) + 1):
            with self.subTest(course_id=course_id):
                response = self.client.post(
                    self.list_url, {"title": "Study", "course": course_id}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("course", response.data)
                self.assertEqual(TodoItem.objects.count(), initial_count)

    def test_lists_only_current_students_tasks_across_courses(self):
        another_course = Course.objects.create(owner=self.student_a, name="Networks")
        extra = TodoItem.objects.create(course=another_course, title="Read networking notes")
        for student, expected in (
            (self.student_a, {self.todo_a.pk, extra.pk}),
            (self.student_b, {self.todo_b.pk}),
        ):
            with self.subTest(student=student.email):
                self.authenticate(student)
                response = self.client.get(self.list_url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual({todo["id"] for todo in response.data}, expected)

    def test_student_without_tasks_gets_empty_list(self):
        self.todo_a.delete()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_listing_orders_incomplete_then_due_dates_with_undated_last(self):
        later = TodoItem.objects.create(course=self.course_a, title="Later", due_date="2026-10-22")
        earlier = TodoItem.objects.create(course=self.course_a, title="Earlier", due_date="2026-10-20")
        completed = TodoItem.objects.create(
            course=self.course_a, title="Done", due_date="2026-10-01", is_completed=True
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [todo["id"] for todo in response.data],
            [earlier.pk, later.pk, self.todo_a.pk, completed.pk],
        )

    def test_completion_and_reopening_are_saved_and_returned_by_list(self):
        for completed in (True, False):
            with self.subTest(completed=completed):
                response = self.client.patch(
                    self.detail_url(self.todo_a.pk), {"is_completed": completed}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["is_completed"], completed)
                self.todo_a.refresh_from_db()
                self.assertEqual(self.todo_a.is_completed, completed)
                listing = self.client.get(self.list_url)
                self.assertEqual(listing.data[0]["is_completed"], completed)

    def test_completion_endpoint_does_not_change_title_or_course(self):
        response = self.client.patch(
            self.detail_url(self.todo_a.pk),
            {"is_completed": True, "title": "Changed", "course": self.course_b.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.todo_a.refresh_from_db()
        self.assertEqual(self.todo_a.title, "Read chapter 1")
        self.assertEqual(self.todo_a.course_id, self.course_a.pk)
        self.assertTrue(self.todo_a.is_completed)

    def test_invalid_completion_is_rejected_without_changing_task(self):
        for payload in ({}, {"is_completed": None}, {"is_completed": "invalid"}):
            with self.subTest(payload=payload):
                response = self.client.patch(self.detail_url(self.todo_a.pk), payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.todo_a.refresh_from_db()
                self.assertFalse(self.todo_a.is_completed)

    def test_other_students_task_is_hidden_like_a_missing_task(self):
        missing_id = max(self.todo_a.pk, self.todo_b.pk) + 1
        for todo_id in (self.todo_b.pk, missing_id, 0, 9223372036854775808):
            with self.subTest(todo_id=todo_id):
                response = self.client.patch(
                    self.detail_url(todo_id), {"is_completed": True}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.todo_b.refresh_from_db()
        self.assertFalse(self.todo_b.is_completed)

    def test_all_todo_endpoints_require_valid_authentication(self):
        initial_count = TodoItem.objects.count()
        for token in (None, "invalid-token"):
            if token is None:
                self.client.credentials()
            else:
                self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            requests = (
                ("get", self.list_url, {}),
                ("post", self.list_url, {"title": "Study", "course": self.course_a.pk}),
                ("patch", self.detail_url(self.todo_a.pk), {"is_completed": True}),
            )
            for method, url, payload in requests:
                with self.subTest(token=token, method=method):
                    response = getattr(self.client, method)(url, payload, format="json")
                    self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(TodoItem.objects.count(), initial_count)
        self.todo_a.refresh_from_db()
        self.assertFalse(self.todo_a.is_completed)
