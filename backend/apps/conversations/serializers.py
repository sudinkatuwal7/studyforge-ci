from rest_framework import serializers

from apps.conversations.models import Conversation, ConversationMessage
from apps.conversations.services import shown_status
from apps.documents.serializers import DocumentSerializer
from apps.knowledge.serializers import RAGQuerySerializer


class ConversationCreateSerializer(serializers.Serializer):
    course_id = serializers.IntegerField(min_value=1, max_value=9223372036854775807,
                                         required=False, allow_null=True)
    title = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ("id", "course_id", "title", "created_at", "updated_at")
        read_only_fields = fields


class ConversationMessageSerializer(serializers.ModelSerializer):
    reply_to = serializers.PrimaryKeyRelatedField(read_only=True)
    status = serializers.SerializerMethodField()

    def get_status(self, message):
        return shown_status(message, self.context.get("now"))

    class Meta:
        model = ConversationMessage
        fields = ("id", "role", "status", "content", "citations", "reply_to", "created_at")
        read_only_fields = fields


class QuestionRetrySerializer(RAGQuerySerializer):
    """A retry re-answers the saved question text; only the sources are sent.

    Same document_ids rules as a new question; setting question to None removes it.
    """

    question = None


class ConversationUploadSerializer(DocumentSerializer):
    class Meta(DocumentSerializer.Meta):
        fields = DocumentSerializer.Meta.fields + ("conversation_id",)
        read_only_fields = fields
