"""The seven-field SCRUM-8 public representation."""

from rest_framework import serializers

from apps.documents.errors import error_body
from apps.documents.models import Document


class DocumentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="title", read_only=True)
    error = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = ("id", "course_id", "name", "status", "created_at", "updated_at", "error")
        read_only_fields = fields

    def get_error(self, document):
        if document.status != Document.Status.FAILED:
            return None
        code = document.error_code or Document.ErrorCode.PROCESSING_FAILED
        if code not in Document.ErrorCode.values:
            code = Document.ErrorCode.PROCESSING_FAILED
        return error_body(code)
