from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.courses.models import Course
from apps.quizzes.models import Question, Quiz, SurvivalAnswer, SurvivalSession


class SurvivalModelTestCase(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=user, name="CS 3358")
        self.quiz = Quiz.objects.create(owner=user, course=self.course, title="Survival")
        self.question = Question.objects.create(
            quiz=self.quiz,
            position=1,
            text="2 + 2?",
            options=["4", "5"],
            correct_option_index=0,
        )

    def assert_rejected(self, **fields):
        with self.assertRaises(IntegrityError), transaction.atomic():
            SurvivalSession.objects.create(quiz=self.quiz, **fields)


class SurvivalSessionModelTests(SurvivalModelTestCase):
    def test_new_session_starts_with_3_lives_score_0_at_question_1(self):
        session = SurvivalSession.objects.create(quiz=self.quiz)
        session.refresh_from_db()

        self.assertEqual(session.lives, 3)
        self.assertEqual(session.score, 0)
        self.assertEqual(session.current_position, 1)
        self.assertEqual(session.status, SurvivalSession.Status.ACTIVE)
        self.assertTrue(session.is_active)
        self.assertIsNotNone(session.started_at)
        self.assertIsNone(session.ended_at)
        self.assertEqual(self.quiz.survival_session, session)

    def test_lives_cannot_exceed_the_maximum(self):
        self.assert_rejected(lives=4)

    def test_position_must_be_positive(self):
        self.assert_rejected(current_position=0)

    def test_status_must_be_a_known_value(self):
        self.assert_rejected(status="PAUSED")

    def test_ended_at_is_set_exactly_when_the_game_has_ended(self):
        with self.subTest("active game with an end time"):
            self.assert_rejected(ended_at=timezone.now())
        with self.subTest("ended game without an end time"):
            self.assert_rejected(status=SurvivalSession.Status.GAME_OVER)

    def test_a_quiz_has_at_most_one_survival_session(self):
        SurvivalSession.objects.create(quiz=self.quiz)

        self.assert_rejected()

    def test_deleting_the_course_deletes_the_session_and_answers(self):
        session = SurvivalSession.objects.create(quiz=self.quiz)
        SurvivalAnswer.objects.create(
            session=session, question=self.question, selected_option_index=0, is_correct=True
        )

        self.course.delete()

        self.assertFalse(SurvivalSession.objects.exists())
        self.assertFalse(SurvivalAnswer.objects.exists())


class SurvivalAnswerModelTests(SurvivalModelTestCase):
    def test_a_question_can_be_answered_only_once_per_session(self):
        session = SurvivalSession.objects.create(quiz=self.quiz)
        SurvivalAnswer.objects.create(
            session=session, question=self.question, selected_option_index=0, is_correct=True
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            SurvivalAnswer.objects.create(
                session=session, question=self.question, selected_option_index=1, is_correct=False
            )
