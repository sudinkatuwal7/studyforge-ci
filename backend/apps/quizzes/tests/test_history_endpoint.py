from rest_framework.test import APIClient

from apps.quizzes.models import Quiz, SurvivalSession
from apps.quizzes.tests.test_history_selectors import QuizHistoryTestCase

URL = "/api/v1/quiz-history/"


class QuizHistoryEndpointTestCase(QuizHistoryTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def get(self, **params):
        return self.client.get(URL, params)


class QuizHistoryEndpointTests(QuizHistoryEndpointTestCase):
    """GET /api/v1/quiz-history/"""

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(self.get().status_code, 401)

    def test_regular_quiz_row_has_course_mode_score_and_date(self):
        submission = self.finish_regular(score=3, total=5, title="Quiz: Lecture 3")

        response = self.get()

        self.assertEqual(response.status_code, 200)
        [row] = response.json()
        self.assertEqual(
            {key: value for key, value in row.items() if key != "submitted_at"},
            {
                "quiz_id": submission.quiz_id,
                "title": "Quiz: Lecture 3",
                "course": self.course.pk,
                "course_name": "CS 3358",
                "mode": "regular",
                "survival_status": None,
                "score": 3,
                "total_questions": 5,
                "percentage": 60,
            },
        )
        self.assertTrue(row["submitted_at"])

    def test_survival_row_reports_mode_and_how_the_game_ended(self):
        for status in (SurvivalSession.Status.GAME_OVER, SurvivalSession.Status.COMPLETED):
            with self.subTest(status=status):
                Quiz.objects.all().delete()
                self.finish_survival(score=2, total=5, status=status)

                [row] = self.get().json()

                self.assertEqual(row["mode"], "survival")
                self.assertEqual(row["survival_status"], status)
                self.assertEqual((row["score"], row["percentage"]), (2, 40))

    def test_only_the_students_own_history(self):
        mine = self.finish_regular()
        self.finish_regular(course=self.other_course)
        self.finish_survival(course=self.other_course)

        rows = self.get().json()

        self.assertEqual([row["quiz_id"] for row in rows], [mine.quiz_id])

    def test_other_student_sees_none_of_it(self):
        self.finish_regular()
        self.client.force_authenticate(user=self.other)

        self.assertEqual(self.get().json(), [])

    def test_unfinished_quizzes_are_not_listed(self):
        self.make_quiz()
        SurvivalSession.objects.create(quiz=self.make_quiz())

        self.assertEqual(self.get().json(), [])

    def test_newest_first(self):
        old = self.finish_regular(days_ago=2)
        new = self.finish_survival()

        rows = self.get().json()

        self.assertEqual([row["quiz_id"] for row in rows], [new.quiz_id, old.quiz_id])

    def test_filters_by_course(self):
        first = self.finish_regular()
        self.finish_regular(course=self.second_course)

        rows = self.get(course=self.course.pk).json()

        self.assertEqual([row["quiz_id"] for row in rows], [first.quiz_id])

    def test_own_course_with_no_results_is_an_empty_list(self):
        response = self.get(course=self.second_course.pk)

        self.assertEqual((response.status_code, response.json()), (200, []))

    def test_another_students_course_is_404(self):
        self.finish_regular(course=self.other_course)

        self.assertEqual(self.get(course=self.other_course.pk).status_code, 404)

    def test_missing_course_is_404(self):
        self.assertEqual(self.get(course=999999).status_code, 404)

    def test_invalid_course_is_400(self):
        for value in ("abc", "0", "-1"):
            with self.subTest(value=value):
                response = self.get(course=value)

                self.assertEqual(response.status_code, 400)
                self.assertIn("course", response.json())

    def test_query_count_does_not_grow_with_rows(self):
        for _ in range(3):
            self.finish_regular()
            self.finish_survival(course=self.second_course)

        # One query whatever the number of rows: course and mode are joined in.
        with self.assertNumQueries(1):
            self.assertEqual(len(self.get().json()), 6)
