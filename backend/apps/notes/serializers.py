from rest_framework import serializers

from apps.notes.llm import NoteOptions
from apps.notes.models import CourseNotes, DetailLevel, NoteFormat, NoteType, StudyGuide
from apps.notes.selectors import get_source_documents

MAX_SOURCE_DOCUMENTS = 20


class GenerateCourseNotesSerializer(serializers.Serializer):
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=MAX_SOURCE_DOCUMENTS,
        error_messages={"empty": "Select at least one material."},
    )
    # Fixed lists only: anything else is a 400 before the model is called.
    # Omitted options fall back to how notes were generated before SCRUM-86.
    note_type = serializers.ChoiceField(choices=NoteType.choices, default=NoteType.OUTLINE)
    detail_level = serializers.ChoiceField(choices=DetailLevel.choices, default=DetailLevel.STANDARD)
    format = serializers.ChoiceField(choices=NoteFormat.choices, default=NoteFormat.BULLETS)

    def validate_document_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Each document can be selected only once.")
        return value

    def get_options(self):
        data = self.validated_data
        return NoteOptions(
            note_type=data["note_type"], detail_level=data["detail_level"], format=data["format"]
        )


def notes_options(notes):
    return {
        "note_type": notes.note_type,
        "detail_level": notes.detail_level,
        "format": notes.format,
    }


class CourseNotesSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()
    source_documents = serializers.SerializerMethodField()

    class Meta:
        model = CourseNotes
        fields = [
            "id", "title", "course", "options", "overview", "sections", "source_documents",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_options(self, notes):
        return notes_options(notes)

    def get_source_documents(self, notes):
        return get_source_documents(notes)


class CourseNotesSummarySerializer(serializers.ModelSerializer):
    """One row of the notes library: no content, so the list stays small."""

    course_name = serializers.CharField(source="course.name", read_only=True)
    options = serializers.SerializerMethodField()

    class Meta:
        model = CourseNotes
        fields = ["id", "title", "course", "course_name", "options", "created_at", "updated_at"]
        read_only_fields = fields

    def get_options(self, notes):
        return notes_options(notes)


class NotesLibraryQuerySerializer(serializers.Serializer):
    # Bounded to a bigint so an oversized id is a 400, not a database error.
    course = serializers.IntegerField(min_value=1, max_value=2**63 - 1, required=False)


class UpdateCourseNotesSerializer(serializers.Serializer):
    """The editable fields of saved notes; any other key is ignored.

    Owner, course, options and source documents are never written here.
    `overview` and `sections` are taken as raw JSON so that
    validate_course_notes, the check generated notes pass, judges their shape
    rather than a serializer coercing them first.
    """

    title = serializers.CharField(max_length=CourseNotes._meta.get_field("title").max_length, required=False)
    overview = serializers.JSONField(required=False)
    sections = serializers.JSONField(required=False)

    def validate_title(self, value):
        if not isinstance(self.initial_data.get("title"), str):
            raise serializers.ValidationError("Title must be text.")
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise serializers.ValidationError("Title cannot contain control characters.")
        return value


class StudyGuideSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyGuide
        fields = ["key_concepts", "important_points", "summary"]
        read_only_fields = fields