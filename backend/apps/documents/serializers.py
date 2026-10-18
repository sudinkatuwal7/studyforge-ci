"""The seven-field SCRUM-8 public representation."""

from rest_framework import serializers

from apps.documents.errors import DocumentAPIError, error_body
from apps.documents.models import Document


def validate_display_name(data):
    if not isinstance(data, dict) or set(data) != {"name"}:
        raise DocumentAPIError("INVALID_MATERIAL_UPDATE")
    name = data["name"]
    if not isinstance(name, str):
        raise DocumentAPIError("INVALID_NAME")
    name = name.strip()
    if not name or len(name) > Document._meta.get_field("title").max_length or any(
        ord(char) < 32 or ord(char) == 127 for char in name
    ):
        raise DocumentAPIError("INVALID_NAME")
    return name


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
