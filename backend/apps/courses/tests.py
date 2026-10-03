"""SCRUM-35: verify course creation and ownership through the real API."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import Course


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
