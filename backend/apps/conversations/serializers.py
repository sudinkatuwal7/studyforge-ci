from rest_framework import serializers

from apps.conversations.models import Conversation
from apps.documents.serializers import DocumentSerializer


class ConversationCreateSerializer(serializers.Serializer):
    course_id = serializers.IntegerField(min_value=1, max_value=9223372036854775807,
                                         required=False, allow_null=True)
    title = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ("id", "course_id", "title", "created_at", "updated_at")
        read_only_fields = fields


class ConversationUploadSerializer(DocumentSerializer):
    class Meta(DocumentSerializer.Meta):
        fields = DocumentSerializer.Meta.fields + ("conversation_id",)
        read_only_fields = fields
