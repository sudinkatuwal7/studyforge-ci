from rest_framework import serializers

from apps.quizzes.llm import ALLOWED_QUESTION_COUNTS
from apps.quizzes.models import Question, Quiz, QuizSubmission

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
