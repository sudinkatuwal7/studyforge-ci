from rest_framework import serializers

from apps.quizzes.llm import ALLOWED_QUESTION_COUNTS
from apps.quizzes.models import Question, Quiz, QuizSubmission, SurvivalAnswer, SurvivalSession
from apps.quizzes.selectors import quiz_mode

MAX_SOURCE_DOCUMENTS = 20


class GenerateQuizSerializer(serializers.Serializer):
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=MAX_SOURCE_DOCUMENTS,
    )
    num_questions = serializers.ChoiceField(choices=ALLOWED_QUESTION_COUNTS)

    def validate_document_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Each document can be selected only once.")
        return value


class QuestionPublicSerializer(serializers.ModelSerializer):
    """What a student sees while taking a quiz.

    The fields are listed rather than excluded, so correct_option_index and
    explanation stay hidden even if Question gains new fields. They are
    revealed only after submission (SCRUM-51).
    """

    class Meta:
        model = Question
        fields = ["id", "position", "text", "options"]
        read_only_fields = fields


class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionPublicSerializer(many=True, read_only=True)
    # Lets the quiz player send a student who reloads a finished quiz
    # straight to the results instead of a player that cannot submit.
    is_submitted = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            "id",
            "title",
            "course",
            "source_documents",
            "created_at",
            "is_submitted",
            "questions",
        ]
        read_only_fields = fields

    def get_is_submitted(self, quiz):
        return hasattr(quiz, "submission")


class AnswerInputSerializer(serializers.Serializer):
    question_id = serializers.IntegerField(min_value=1)
    # Null means the student left the question unanswered.
    selected_option_index = serializers.IntegerField(min_value=0, allow_null=True)


class SubmitQuizSerializer(serializers.Serializer):
    """Checks a submission against the quiz passed in context["quiz"].

    Every question must appear exactly once, so a client that loaded a
    stale or different quiz is rejected rather than graded on a subset.
    """

    answers = AnswerInputSerializer(many=True, allow_empty=False)

    def validate_answers(self, answers):
        questions = {question.pk: question for question in self.context["quiz"].questions.all()}
        question_ids = [answer["question_id"] for answer in answers]

        if len(set(question_ids)) != len(question_ids):
            raise serializers.ValidationError("Each question can be answered only once.")
        if set(question_ids) != set(questions):
            raise serializers.ValidationError("Answer every question in this quiz exactly once.")

        for answer in answers:
            index = answer["selected_option_index"]
            if index is not None and index >= len(questions[answer["question_id"]].options):
                raise serializers.ValidationError(
                    f"Question {answer['question_id']} has no option {index}."
                )
        return answers


class QuestionResultSerializer(serializers.Serializer):
    """One reviewed question: the public fields plus what was chosen, what
    was right, and why. Only ever built from a saved submission."""

    id = serializers.IntegerField(source="question.id")
    position = serializers.IntegerField(source="question.position")
    text = serializers.CharField(source="question.text")
    options = serializers.ListField(source="question.options", child=serializers.CharField())
    selected_option_index = serializers.IntegerField(allow_null=True)
    correct_option_index = serializers.IntegerField(source="question.correct_option_index")
    is_correct = serializers.BooleanField()
    explanation = serializers.CharField(source="question.explanation")


class QuizResultSerializer(serializers.ModelSerializer):
    quiz_id = serializers.IntegerField(source="quiz.id")
    title = serializers.CharField(source="quiz.title")
    course = serializers.IntegerField(source="quiz.course_id")
    percentage = serializers.IntegerField()
    questions = QuestionResultSerializer(source="answers", many=True)

    class Meta:
        model = QuizSubmission
        fields = [
            "quiz_id",
            "title",
            "course",
            "score",
            "total_questions",
            "percentage",
            "submitted_at",
            "questions",
        ]
        read_only_fields = fields


class QuizHistoryQuerySerializer(serializers.Serializer):
    course = serializers.IntegerField(min_value=1, required=False)


class QuizHistoryItemSerializer(serializers.ModelSerializer):
    """One finished quiz or Survival game. Built from a QuizSubmission
    loaded by list_quiz_history, so course and mode need no extra query."""

    quiz_id = serializers.IntegerField(source="quiz.id")
    title = serializers.CharField(source="quiz.title")
    course = serializers.IntegerField(source="quiz.course_id")
    course_name = serializers.CharField(source="quiz.course.name")
    mode = serializers.SerializerMethodField()
    # GAME_OVER or COMPLETED for Survival, null for a regular quiz.
    survival_status = serializers.SerializerMethodField()
    percentage = serializers.IntegerField()

    class Meta:
        model = QuizSubmission
        fields = [
            "quiz_id",
            "title",
            "course",
            "course_name",
            "mode",
            "survival_status",
            "score",
            "total_questions",
            "percentage",
            "submitted_at",
        ]
        read_only_fields = fields

    def get_mode(self, submission):
        return quiz_mode(submission.quiz)

    def get_survival_status(self, submission):
        session = getattr(submission.quiz, "survival_session", None)
        return session.status if session else None


class BestPercentageSerializer(serializers.Serializer):
    # Null when no quiz of that mode has been finished in the course.
    regular = serializers.IntegerField(allow_null=True)
    survival = serializers.IntegerField(allow_null=True)


class QuizProgressSerializer(serializers.Serializer):
    """Built from the dict get_quiz_progress returns."""

    course = serializers.IntegerField()
    quizzes_taken = serializers.IntegerField()
    best_percentage = BestPercentageSerializer()
    recent = QuizHistoryItemSerializer(many=True)


class SurvivalAnswerInputSerializer(serializers.Serializer):
    """One Survival answer. The client names the question it is answering,
    so a double click or a stale tab cannot land on the next question.
    Whether the option exists is checked against the question itself."""

    question_id = serializers.IntegerField(min_value=1)
    selected_option_index = serializers.IntegerField(min_value=0)


class SurvivalSessionSerializer(serializers.ModelSerializer):
    """The game state. Built only from the database, so a reload shows the
    same lives, score and question. Only the current question is sent, and
    without its answer; future questions never leave the server."""

    quiz_id = serializers.IntegerField(read_only=True)
    course = serializers.IntegerField(source="quiz.course_id", read_only=True)
    max_lives = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()
    current_question = serializers.SerializerMethodField()

    class Meta:
        model = SurvivalSession
        fields = [
            "id",
            "quiz_id",
            "course",
            "status",
            "lives",
            "max_lives",
            "score",
            "current_position",
            "total_questions",
            "current_question",
            "started_at",
            "ended_at",
        ]
        read_only_fields = fields

    def get_max_lives(self, session):
        return SurvivalSession.MAX_LIVES

    def get_total_questions(self, session):
        return len(session.quiz.questions.all())

    def get_current_question(self, session):
        if not session.is_active:
            return None
        question = next(
            q for q in session.quiz.questions.all() if q.position == session.current_position
        )
        return QuestionPublicSerializer(question).data


class SurvivalAnswerResultSerializer(serializers.ModelSerializer):
    """Feedback for the question just answered. Its answer and explanation
    are revealed here, and only after it has been answered."""

    question_id = serializers.IntegerField(read_only=True)
    correct_option_index = serializers.IntegerField(
        source="question.correct_option_index", read_only=True
    )
    explanation = serializers.CharField(source="question.explanation", read_only=True)

    class Meta:
        model = SurvivalAnswer
        fields = [
            "question_id",
            "selected_option_index",
            "is_correct",
            "correct_option_index",
            "explanation",
        ]
        read_only_fields = fields
