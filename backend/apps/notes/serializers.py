from rest_framework import serializers

from apps.notes.models import CourseNotes, StudyGuide

MAX_SOURCE_DOCUMENTS = 20


class GenerateCourseNotesSerializer(serializers.Serializer):
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=MAX_SOURCE_DOCUMENTS,
    )

    def validate_document_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Each document can be selected only once.")
        return value


class CourseNotesSerializer(serializers.ModelSerializer):
    source_documents = serializers.SerializerMethodField()

    class Meta:
        model = CourseNotes
        fields = ["id", "title", "course", "overview", "sections", "source_documents", "created_at"]
        read_only_fields = fields

    def get_source_documents(self, notes):
        return [
            {"id": document.pk, "name": document.title}
            for document in sorted(notes.source_documents.all(), key=lambda d: d.pk)
        ]


class StudyGuideSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyGuide
        fields = ["key_concepts", "important_points", "summary"]
        read_only_fields = fields