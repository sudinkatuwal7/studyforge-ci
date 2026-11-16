from apps.courses.models import Course
from apps.documents.models import Document
from apps.quizzes.models import Question, QuizSubmission, SurvivalAnswer, SurvivalSession
from apps.quizzes.tests.test_generation_endpoint import HIDDEN_FIELDS, QuizEndpointTestCase

PUBLIC_QUESTION_FIELDS = {"id", "position", "text", "options"}


class SurvivalEndpointTestCase(QuizEndpointTestCase):
    def setUp(self):
        super().setUp()
        self.start_url = f"/api/v1/courses/{self.course.pk}/survival-sessions/"

    def start(self, num_questions=5, document_ids=None, url=None):
        return self.post(document_ids, num_questions, url=url or self.start_url)

    def started(self, num_questions=5):
        body = self.start(num_questions).json()
        self.session_url = f"/api/v1/survival-sessions/{body['id']}/"
        self.answer_url = f"{self.session_url}answers/"
        return body

    def answer(self, state, correct, question_id=None):
        """Answer the question shown in `state` right or wrong."""
        shown = state["current_question"]
        question = Question.objects.get(pk=shown["id"])
        index = question.correct_option_index
        if not correct:
            index = (index + 1) % len(question.options)
        body = {"question_id": question_id or shown["id"], "selected_option_index": index}
        return self.client.post(self.answer_url, body, format="json")

    def play(self, *results):
        """Start a 5-question game and answer in order. Returns the last state."""
        state = self.started()
        for correct in results:
            state = self.answer(state, correct).json()["session"]
        return state

    def assert_question_hidden(self, question):
        self.assertEqual(set(question), PUBLIC_QUESTION_FIELDS)
        for field in HIDDEN_FIELDS:
            self.assertNotIn(field, question)


class StartSurvivalEndpointTests(SurvivalEndpointTestCase):
    """POST /api/v1/courses/{course_id}/survival-sessions/"""

    def test_returns_the_first_question_with_3_lives_and_score_0(self):
        response = self.start()

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "ACTIVE")
        self.assertEqual((body["lives"], body["max_lives"], body["score"]), (3, 3, 0))
        self.assertEqual((body["current_position"], body["total_questions"]), (1, 5))
        self.assertEqual(body["course"], self.course.pk)
        self.assertEqual(body["current_question"]["position"], 1)
        self.assert_question_hidden(body["current_question"])

    def test_student_chooses_5_or_10_questions(self):
        for count in (5, 10):
            with self.subTest(count=count):
                body = self.start(count).json()

                self.assertEqual(body["total_questions"], count)

    def test_other_question_counts_are_rejected(self):
        response = self.start(num_questions=7)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SurvivalSession.objects.exists())

    def test_never_sends_more_than_the_current_question(self):
        body = self.start().json()

        self.assertNotIn("questions", body)

    def test_document_not_ready_returns_409(self):
        pending = self.make_document(
            self.user, self.course, "Lecture 4", status=Document.Status.PROCESSING
        )

        response = self.start(document_ids=[pending.pk])

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "DOCUMENT_NOT_READY")
        self.assertFalse(SurvivalSession.objects.exists())

    def test_another_students_course_returns_404(self):
        course = Course.objects.create(owner=self.other, name="Not mine")

        response = self.start(url=f"/api/v1/courses/{course.pk}/survival-sessions/")

        self.assertEqual(response.status_code, 404)
        self.assertFalse(SurvivalSession.objects.exists())

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        self.assertIn(self.start().status_code, (401, 403))


class AnswerSurvivalEndpointTests(SurvivalEndpointTestCase):
    """POST /api/v1/survival-sessions/{session_id}/answers/"""

    def test_wrong_answer_removes_a_life_and_reveals_only_that_answer(self):
        state = self.started()
        question = Question.objects.get(pk=state["current_question"]["id"])

        response = self.answer(state, correct=False)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["is_correct"])
        self.assertEqual(body["question_id"], question.pk)
        self.assertEqual(body["correct_option_index"], question.correct_option_index)
        self.assertEqual(body["explanation"], question.explanation)
        self.assertEqual((body["session"]["lives"], body["session"]["score"]), (2, 0))
        self.assertEqual(body["session"]["current_position"], 2)
        self.assert_question_hidden(body["session"]["current_question"])

    def test_correct_answer_increases_the_score(self):
        state = self.started()

        body = self.answer(state, correct=True).json()

        self.assertTrue(body["is_correct"])
        self.assertEqual((body["session"]["lives"], body["session"]["score"]), (3, 1))

    def test_game_over_at_zero_lives_and_further_answers_are_rejected(self):
        state = self.play(True, False, False, False)

        self.assertEqual(state["status"], "GAME_OVER")
        self.assertEqual((state["lives"], state["score"]), (0, 1))
        self.assertIsNone(state["current_question"])
        self.assertIsNotNone(state["ended_at"])

        last = Question.objects.get(quiz_id=state["quiz_id"], position=5)
        response = self.client.post(
            self.answer_url, {"question_id": last.pk, "selected_option_index": 0}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "SURVIVAL_SESSION_ENDED")
        self.assertEqual(response.json()["session"]["status"], "GAME_OVER")

    def test_game_completes_after_the_last_question(self):
        state = self.play(True, True, False, True, True)

        self.assertEqual(state["status"], "COMPLETED")
        self.assertEqual((state["lives"], state["score"]), (2, 4))
        self.assertIsNone(state["current_question"])

    def test_finished_game_is_saved_for_quiz_history(self):
        state = self.play(True, False, False, False)

        submission = QuizSubmission.objects.get(quiz_id=state["quiz_id"])
        self.assertEqual((submission.score, submission.total_questions), (1, 5))
        response = self.client.get(f"/api/v1/quizzes/{state['quiz_id']}/results/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 1)

    def test_double_answer_is_rejected_and_costs_one_life_only(self):
        state = self.started()
        self.answer(state, correct=False)

        response = self.answer(state, correct=False)

        self.assertEqual(response.status_code, 409)
        body = response.json()
        self.assertEqual(body["code"], "QUESTION_NOT_CURRENT")
        # The real state comes back so a stale tab can catch up.
        self.assertEqual((body["session"]["lives"], body["session"]["current_position"]), (2, 2))
        self.assertEqual(SurvivalAnswer.objects.count(), 1)

    def test_option_out_of_range_returns_400_and_costs_no_life(self):
        state = self.started()

        response = self.client.post(
            self.answer_url,
            {"question_id": state["current_question"]["id"], "selected_option_index": 4},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("selected_option_index", response.json())
        self.assertEqual(self.client.get(self.session_url).json()["lives"], 3)

    def test_invalid_body_returns_400(self):
        state = self.started()
        question_id = state["current_question"]["id"]
        cases = {
            "empty body": {},
            "missing option": {"question_id": question_id},
            "null option": {"question_id": question_id, "selected_option_index": None},
            "negative option": {"question_id": question_id, "selected_option_index": -1},
        }
        for name, body in cases.items():
            with self.subTest(name):
                response = self.client.post(self.answer_url, body, format="json")

                self.assertEqual(response.status_code, 400)
        self.assertFalse(SurvivalAnswer.objects.exists())


class SurvivalStateEndpointTests(SurvivalEndpointTestCase):
    """GET /api/v1/survival-sessions/{session_id}/"""

    def test_refresh_returns_the_same_lives_score_and_question(self):
        state = self.started()
        after = self.answer(state, correct=False).json()["session"]
        after = self.answer(after, correct=True).json()["session"]

        response = self.client.get(self.session_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), after)
        self.assertEqual((after["lives"], after["score"], after["current_position"]), (2, 1, 3))
        self.assert_question_hidden(response.json()["current_question"])


class SurvivalOwnershipTests(SurvivalEndpointTestCase):
    def test_another_student_cannot_see_or_answer_the_session(self):
        state = self.started()
        self.client.force_authenticate(user=self.other)

        with self.subTest("state"):
            self.assertEqual(self.client.get(self.session_url).status_code, 404)
        with self.subTest("answer"):
            response = self.answer(state, correct=True)
            self.assertEqual(response.status_code, 404)

        session = SurvivalSession.objects.get(pk=state["id"])
        self.assertEqual((session.lives, session.score, session.current_position), (3, 0, 1))
        self.assertFalse(SurvivalAnswer.objects.exists())

    def test_missing_session_looks_the_same_as_another_students(self):
        response = self.client.get("/api/v1/survival-sessions/999999/")

        self.assertEqual(response.status_code, 404)
