from collections.abc import Mapping

from rest_framework import serializers

from .models import Course, StudySession, TodoItem


def validate_course_name(value):
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise serializers.ValidationError("Course name cannot contain control characters.")
    return value


def validate_todo_title(value, submitted_value):
    if not isinstance(submitted_value, str):
        raise serializers.ValidationError("Task title must be text.")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise serializers.ValidationError("Task title cannot contain control characters.")
    return value


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name", "description", "created_at", "owner"]
        read_only_fields = ["id", "created_at", "owner"]

    def validate_name(self, value):
        if not isinstance(self.initial_data.get("name"), str):
            raise serializers.ValidationError("Course name must be text.")
        return validate_course_name(value)


class CourseRenameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, trim_whitespace=True)

    def validate_name(self, value):
        if not isinstance(self.initial_data.get("name"), str):
            raise serializers.ValidationError("Course name must be text.")
        return validate_course_name(value)


class TodoItemSerializer(serializers.ModelSerializer):
    # Retries may reuse this key; the view checks ownership and matching details.
    creation_key = serializers.UUIDField(write_only=True)
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.none())

    class Meta:
        model = TodoItem
        fields = ["id", "title", "course", "due_date", "is_completed", "created_at", "creation_key"]
        read_only_fields = ["id", "is_completed", "created_at"]

    def validate_title(self, value):
        return validate_todo_title(value, self.initial_data.get("title"))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            # Validate course IDs against only the signed-in student's courses.
            self.fields["course"].queryset = Course.objects.filter(owner=request.user)


class TodoUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, max_length=200, trim_whitespace=True)
    is_completed = serializers.BooleanField(required=False)

    def validate_title(self, value):
        return validate_todo_title(value, self.initial_data.get("title"))

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide a task title or completion state.")
        return attrs


class StudySessionSerializer(serializers.ModelSerializer):
    # Start with no available courses until the authenticated request is supplied.
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.none())
    time = serializers.TimeField(
        required=False,
        allow_null=True,
        input_formats=["%H:%M", "%H:%M:%S"],
    )

    class Meta:
        model = StudySession
        fields = ["id", "title", "course", "date", "time", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            # Reject foreign course IDs on creation and on course changes during editing.
            self.fields["course"].queryset = Course.objects.filter(owner=request.user)

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            writable_fields = {
                name for name, field in self.fields.items() if not field.read_only
            }
            unsupported = set(data) - writable_fields
            if unsupported:
                raise serializers.ValidationError(
                    {name: ["This field cannot be supplied."] for name in sorted(unsupported)}
                )
        # ModelSerializer validates the title length, required fields, and dates.
        return super().to_internal_value(data)


class StudySessionCreateSerializer(StudySessionSerializer):
    # The creation view handles matching retries, as the To-Do view does.
    creation_key = serializers.UUIDField(write_only=True)

    class Meta(StudySessionSerializer.Meta):
        fields = [*StudySessionSerializer.Meta.fields, "creation_key"]
