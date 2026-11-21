from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.courses.models import Course
from apps.quizzes.models import Quiz, QuizSubmission, SurvivalSession
from apps.quizzes.selectors import list_quiz_history, quiz_mode


class QuizHistoryTestCase(TestCase):
    """Builds finished and unfinished quizzes directly, without the API."""

    def setUp(self):
        users = get_user_model().objects
        self.user = users.create_user(email="student@example.edu", password="TestPassword123!")
        self.other = users.create_user(email="other@example.edu", password="TestPassword123!")
        self.course = Course.objects.create(owner=self.user, name="CS 3358")
        self.second_course = Course.objects.create(owner=self.user, name="MATH 2358")
        self.other_course = Course.objects.create(owner=self.other, name="CS 1428")

    def make_quiz(self, course=None, title="Quiz", owner=None):
        course = course or self.course
        return Quiz.objects.create(owner=owner or course.owner, course=course, title=title)

    def finish_regular(self, course=None, score=3, total=5, title="Quiz", days_ago=0):
        quiz = self.make_quiz(course, title)
        return self._submit(quiz, score, total, days_ago)

    def finish_survival(
        self, course=None, score=2, total=5, status=SurvivalSession.Status.GAME_OVER, days_ago=0
    ):
        quiz = self.make_quiz(course, "Survival")
        lives = 0 if status == SurvivalSession.Status.GAME_OVER else 1
        SurvivalSession.objects.create(
            quiz=quiz, status=status, score=score, lives=lives, ended_at=timezone.now()
        )
        return self._submit(quiz, score, total, days_ago)

    def _submit(self, quiz, score, total, days_ago):
        submission = QuizSubmission.objects.create(quiz=quiz, score=score, total_questions=total)
        if days_ago:
            # submitted_at is auto_now_add, so backdate it with an update.
            QuizSubmission.objects.filter(pk=submission.pk).update(
                submitted_at=timezone.now() - timedelta(days=days_ago)
            )
            submission.refresh_from_db()
        return submission


class ListQuizHistoryTests(QuizHistoryTestCase):
    def test_lists_regular_and_survival_results(self):
        regular = self.finish_regular()
        survival = self.finish_survival()

        self.assertCountEqual(list_quiz_history(self.user), [regular, survival])

    def test_leaves_out_another_students_results(self):
        mine = self.finish_regular()
        self.finish_regular(course=self.other_course)

        self.assertEqual(list(list_quiz_history(self.user)), [mine])

    def test_leaves_out_quizzes_never_submitted(self):
        self.make_quiz()

        self.assertEqual(list(list_quiz_history(self.user)), [])

    def test_leaves_out_survival_games_still_running(self):
        SurvivalSession.objects.create(quiz=self.make_quiz())

        self.assertEqual(list(list_quiz_history(self.user)), [])

    def test_newest_first(self):
        old = self.finish_regular(days_ago=3)
        new = self.finish_regular()
        middle = self.finish_survival(days_ago=1)

        self.assertEqual(list(list_quiz_history(self.user)), [new, middle, old])

    def test_filters_by_course(self):
        first = self.finish_regular()
        self.finish_regular(course=self.second_course)

        self.assertEqual(list(list_quiz_history(self.user, self.course.pk)), [first])

    def test_course_filter_cannot_reach_another_students_course(self):
        self.finish_regular(course=self.other_course)

        self.assertEqual(list(list_quiz_history(self.user, self.other_course.pk)), [])

    def test_loads_course_and_mode_in_one_query(self):
        self.finish_regular()
        self.finish_survival(course=self.second_course)

        with self.assertNumQueries(1):
            rows = [
                (submission.quiz.course.name, quiz_mode(submission.quiz))
                for submission in list_quiz_history(self.user)
            ]

        self.assertCountEqual(rows, [("CS 3358", "regular"), ("MATH 2358", "survival")])
