from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.courses.models import Course
from apps.quizzes.models import Question, Quiz


class QuizModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        self.course = Course.objects.create(owner=self.user, name="CS 3358")

    def test_quiz_stores_title_course_owner_and_creation_date(self):
        quiz = Quiz.objects.create(owner=self.user, course=self.course, title="Week 3 review")
        quiz.refresh_from_db()

        self.assertEqual(quiz.title, "Week 3 review")
        self.assertEqual(quiz.course, self.course)
        self.assertEqual(quiz.owner, self.user)
        self.assertIsNotNone(quiz.created_at)
        self.assertQuerySetEqual(self.course.quizzes.all(), [quiz])
        self.assertQuerySetEqual(self.user.quizzes.all(), [quiz])

    def test_owner_must_own_the_course(self):
        other = get_user_model().objects.create_user(
            email="other@example.edu", password="TestPassword123!"
        )
        quiz = Quiz(owner=other, course=self.course, title="Not mine")

        with self.assertRaises(ValidationError) as ctx:
            quiz.full_clean()
        self.assertIn("course", ctx.exception.message_dict)

    def test_deleting_the_course_deletes_its_quizzes(self):
        Quiz.objects.create(owner=self.user, course=self.course, title="Week 3 review")
        self.course.delete()
        self.assertFalse(Quiz.objects.exists())


class QuestionModelTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            email="student@example.edu", password="TestPassword123!"
        )
        course = Course.objects.create(owner=user, name="CS 3358")
        self.quiz = Quiz.objects.create(owner=user, course=course, title="Week 3 review")

    def make_question(self, **overrides):
        fields = {
            "quiz": self.quiz,
            "position": 1,
            "text": "What does a B-tree keep balanced?",
            "options": ["Height", "Width", "Key size", "Node colour"],
            "correct_option_index": 0,
            "explanation": "Every leaf sits at the same depth.",
        }
        fields.update(overrides)
        return Question(**fields)

    def test_question_stores_options_correct_answer_and_explanation(self):
        question = self.make_question()
        question.full_clean()
        question.save()
        question.refresh_from_db()

        self.assertEqual(question.options, ["Height", "Width", "Key size", "Node colour"])
        self.assertEqual(question.correct_option_index, 0)
        self.assertEqual(question.explanation, "Every leaf sits at the same depth.")

    def test_quiz_returns_its_questions_in_position_order(self):
        third = self.make_question(position=3)
        first = self.make_question(position=1)
        second = self.make_question(position=2)
        for question in (third, first, second):
            question.save()

        self.assertQuerySetEqual(self.quiz.questions.all(), [first, second, third])

    def test_position_is_unique_within_a_quiz(self):
        self.make_question(position=1).save()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_question(position=1).save()

    def test_position_starts_at_one(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_question(position=0).save()

    def test_deleting_a_quiz_deletes_its_questions(self):
        self.make_question().save()
        self.quiz.delete()
        self.assertFalse(Question.objects.exists())

    def test_rejects_fewer_than_two_options(self):
        with self.assertRaises(ValidationError) as ctx:
            self.make_question(options=["Only one"]).full_clean()
        self.assertIn("options", ctx.exception.message_dict)

    def test_rejects_blank_or_non_text_options(self):
        for options in (["Height", "   "], ["Height", 7], "Height, Width"):
            with self.subTest(options=options), self.assertRaises(ValidationError):
                self.make_question(options=options).full_clean()

    def test_rejects_correct_index_outside_the_options(self):
        with self.assertRaises(ValidationError) as ctx:
            self.make_question(correct_option_index=4).full_clean()
        self.assertIn("correct_option_index", ctx.exception.message_dict)
