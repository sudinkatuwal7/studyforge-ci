from apps.quizzes.models import SurvivalSession
from apps.quizzes.tests.test_history_endpoint import QuizHistoryEndpointTestCase


class QuizProgressEndpointTests(QuizHistoryEndpointTestCase):
    """GET /api/v1/courses/{course_id}/quiz-progress/"""

    def progress(self, course=None):
        return self.client.get(f"/api/v1/courses/{(course or self.course).pk}/quiz-progress/")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(self.progress().status_code, 401)

    def test_course_with_no_results(self):
        self.make_quiz()  # generated but never submitted

        response = self.progress()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "course": self.course.pk,
                "quizzes_taken": 0,
                "best_percentage": {"regular": None, "survival": None},
                "recent": [],
            },
        )

    def test_counts_both_modes(self):
        self.finish_regular()
        self.finish_regular()
        self.finish_survival()

        self.assertEqual(self.progress().json()["quizzes_taken"], 3)

    def test_best_score_is_per_mode_and_by_percentage(self):
        self.finish_regular(score=3, total=5)  # 60%
        self.finish_regular(score=4, total=10)  # 40%: more correct, lower percentage
        self.finish_survival(score=1, total=5)  # 20%
        self.finish_survival(score=4, total=5, status=SurvivalSession.Status.COMPLETED)  # 80%

        best = self.progress().json()["best_percentage"]

        self.assertEqual(best, {"regular": 60, "survival": 80})

    def test_best_percentage_is_rounded_like_the_history(self):
        submission = self.finish_regular(score=2, total=3)

        best = self.progress().json()["best_percentage"]["regular"]

        self.assertEqual(best, submission.percentage)
        self.assertEqual(best, 67)

    def test_recent_is_the_latest_five_newest_first(self):
        submissions = [self.finish_regular(days_ago=days) for days in (6, 5, 4, 3, 2, 1)]
        survival = self.finish_survival()

        recent = self.progress().json()["recent"]

        expected = [survival, *reversed(submissions[2:])]
        self.assertEqual([row["quiz_id"] for row in recent], [s.quiz_id for s in expected])
        self.assertEqual(recent[0]["mode"], "survival")
        self.assertEqual(set(recent[0]), set(self.get().json()[0]))

    def test_only_counts_the_requested_course(self):
        self.finish_regular(score=5, total=5)
        self.finish_regular(course=self.second_course, score=1, total=5)

        body = self.progress(self.second_course).json()

        self.assertEqual(body["quizzes_taken"], 1)
        self.assertEqual(body["best_percentage"]["regular"], 20)

    def test_another_students_course_is_404(self):
        self.finish_regular(course=self.other_course)

        self.assertEqual(self.progress(self.other_course).status_code, 404)

    def test_missing_course_is_404(self):
        self.assertEqual(self.client.get("/api/v1/courses/999999/quiz-progress/").status_code, 404)
