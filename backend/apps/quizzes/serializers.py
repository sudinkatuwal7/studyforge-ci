from rest_framework import serializers

from apps.quizzes.llm import ALLOWED_QUESTION_COUNTS
from apps.quizzes.models import Question, Quiz

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

    class Meta:
        model = Quiz
        fields = ["id", "title", "course", "source_documents", "created_at", "questions"]
        read_only_fields = fields
