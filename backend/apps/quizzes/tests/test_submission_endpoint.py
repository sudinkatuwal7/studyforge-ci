from unittest import mock

from django.db import IntegrityError

from apps.quizzes.models import Quiz, QuizSubmission, SubmittedAnswer
from apps.quizzes.tests.test_generation_endpoint import HIDDEN_FIELDS, QuizEndpointTestCase


class QuizSubmissionTestCase(QuizEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.quiz = Quiz.objects.get(pk=self.post().json()["id"])
        self.questions = list(self.quiz.questions.all())
        self.submit_url = f"/api/v1/quizzes/{self.quiz.pk}/submit/"
        self.results_url = f"/api/v1/quizzes/{self.quiz.pk}/results/"

    def answers(self, correct=None):
        """Answer every question: the first `correct` right, the rest wrong.
        All right by default."""
        correct = len(self.questions) if correct is None else correct
        answers = []
        for n, question in enumerate(self.questions):
            index = question.correct_option_index
            if n >= correct:
                index = (index + 1) % len(question.options)
            answers.append({"question_id": question.pk, "selected_option_index": index})
        return answers

    def submit(self, answers=None):
        body = {"answers": self.answers() if answers is None else answers}
        return self.client.post(self.submit_url, body, format="json")


class SubmitQuizEndpointTests(QuizSubmissionTestCase):
    """POST /api/v1/quizzes/{quiz_id}/submit/"""

    def test_scores_answers_and_reports_percentage(self):
        response = self.submit(self.answers(correct=3))

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["quiz_id"], self.quiz.pk)
        self.assertEqual(body["course"], self.course.pk)
        self.assertEqual((body["score"], body["total_questions"]), (3, 5))
        self.assertEqual(body["percentage"], 60)
        self.assertEqual(
            [question["is_correct"] for question in body["questions"]],
            [True, True, True, False, False],
        )

    def test_perfect_and_zero_scores(self):
        for correct, percentage in ((5, 100), (0, 0)):
            with self.subTest(correct=correct):
                QuizSubmission.objects.all().delete()

                body = self.submit(self.answers(correct=correct)).json()

                self.assertEqual(body["score"], correct)
                self.assertEqual(body["percentage"], percentage)

    def test_results_reveal_answers_and_explanations_in_order(self):
        body = self.submit(self.answers(correct=4)).json()

        self.assertEqual([q["position"] for q in body["questions"]], [1, 2, 3, 4, 5])
        last, question = body["questions"][-1], self.questions[-1]
        self.assertEqual(last["id"], question.pk)
        self.assertEqual(last["correct_option_index"], question.correct_option_index)
        self.assertNotEqual(last["selected_option_index"], question.correct_option_index)
        self.assertEqual(last["explanation"], question.explanation)
        self.assertEqual(last["options"], question.options)

    def test_unanswered_question_counts_as_incorrect(self):
        answers = self.answers()
        answers[0]["selected_option_index"] = None

        response = self.submit(answers)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["score"], 4)
        first = response.json()["questions"][0]
        self.assertIsNone(first["selected_option_index"])
        self.assertFalse(first["is_correct"])

    def test_answer_order_in_request_does_not_matter(self):
        response = self.submit(list(reversed(self.answers(correct=1))))

        self.assertEqual(response.status_code, 201)
        # The last answer sent was for question 1 and is the only right one.
        self.assertEqual(response.json()["score"], 1)
        self.assertTrue(response.json()["questions"][0]["is_correct"])

    def test_client_cannot_influence_grading(self):
        answers = self.answers(correct=0)
        for answer in answers:
            answer["is_correct"] = True
        body = {"answers": answers, "score": 5}

        response = self.client.post(self.submit_url, body, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["score"], 0)

    def test_second_submission_returns_409_and_keeps_first(self):
        self.submit(self.answers(correct=2))

        response = self.submit(self.answers(correct=5))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "QUIZ_ALREADY_SUBMITTED")
        self.assertEqual(QuizSubmission.objects.get().score, 2)

    def test_racing_submission_returns_409(self):
        """The view's pre-check passed, but another request saved first."""
        with mock.patch(
            "apps.quizzes.services.QuizSubmission.objects.create",
            side_effect=IntegrityError("duplicate key"),
        ):
            response = self.submit()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "QUIZ_ALREADY_SUBMITTED")

    def test_invalid_answers_return_400_and_save_nothing(self):
        first = self.questions[0]
        cases = {
            "missing answers": None,
            "empty answers": [],
            "missing a question": self.answers()[1:],
            "duplicate question": self.answers() + self.answers()[:1],
            "question from another quiz": self.answers()[1:]
            + [{"question_id": 999_999, "selected_option_index": 0}],
            "option out of range": [
                {"question_id": first.pk, "selected_option_index": len(first.options)}
            ]
            + self.answers()[1:],
            "negative option": [{"question_id": first.pk, "selected_option_index": -1}]
            + self.answers()[1:],
            "missing selection key": [{"question_id": first.pk}] + self.answers()[1:],
        }
        for name, answers in cases.items():
            with self.subTest(name):
                body = {} if answers is None else {"answers": answers}
                response = self.client.post(self.submit_url, body, format="json")
                self.assertEqual(response.status_code, 400)
        self.assertFalse(QuizSubmission.objects.exists())
        self.assertFalse(SubmittedAnswer.objects.exists())

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        self.assertIn(self.submit().status_code, (401, 403))
        self.assertFalse(QuizSubmission.objects.exists())

    def test_other_users_quiz_returns_404(self):
        answers = self.answers()
        self.client.force_authenticate(user=self.other)

        self.assertEqual(self.submit(answers).status_code, 404)
        self.assertFalse(QuizSubmission.objects.exists())

    def test_nonexistent_quiz_returns_404(self):
        response = self.client.post(
            "/api/v1/quizzes/999999/submit/", {"answers": self.answers()}, format="json"
        )

        self.assertEqual(response.status_code, 404)


class QuizResultsEndpointTests(QuizSubmissionTestCase):
    """GET /api/v1/quizzes/{quiz_id}/results/"""

    def test_returns_saved_results(self):
        submitted = self.submit(self.answers(correct=3)).json()

        response = self.client.get(self.results_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), submitted)

    def test_unsubmitted_quiz_returns_404(self):
        """Explanations stay hidden until the whole quiz is submitted."""
        self.assertEqual(self.client.get(self.results_url).status_code, 404)

    def test_other_users_results_return_404(self):
        self.submit()
        self.client.force_authenticate(user=self.other)

        self.assertEqual(self.client.get(self.results_url).status_code, 404)

    def test_unauthenticated_request_is_rejected(self):
        self.submit()
        self.client.force_authenticate(user=None)

        self.assertIn(self.client.get(self.results_url).status_code, (401, 403))


class QuizDetailAfterSubmissionTests(QuizSubmissionTestCase):
    """GET /api/v1/quizzes/{quiz_id}/ tells the player whether to show results."""

    def test_reports_submission_state_and_keeps_answers_hidden(self):
        detail_url = f"/api/v1/quizzes/{self.quiz.pk}/"
        self.assertFalse(self.client.get(detail_url).json()["is_submitted"])

        self.submit()
        body = self.client.get(detail_url).json()

        self.assertTrue(body["is_submitted"])
        # Answers come from the results endpoint only, so there is one
        # place that decides when they are revealed.
        for question in body["questions"]:
            for field in HIDDEN_FIELDS:
                self.assertNotIn(field, question)

    def test_new_quiz_is_not_submitted(self):
        self.assertFalse(self.post().json()["is_submitted"])
