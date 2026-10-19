from collections.abc import Mapping

from rest_framework import serializers

from .models import Course, StudySession, TodoItem


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name", "description", "created_at", "owner"]
        read_only_fields = ["id", "created_at", "owner"]


class TodoItemSerializer(serializers.ModelSerializer):
    # Retries may reuse this key; the view checks ownership and matching details.
    creation_key = serializers.UUIDField(write_only=True)
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.none())

    class Meta:
        model = TodoItem
        fields = ["id", "title", "course", "due_date", "is_completed", "created_at", "creation_key"]
        read_only_fields = ["id", "is_completed", "created_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            # Validate course IDs against only the signed-in student's courses.
            self.fields["course"].queryset = Course.objects.filter(owner=request.user)


class TodoCompletionSerializer(serializers.Serializer):
    # A completion request must explicitly supply the desired state.
    is_completed = serializers.BooleanField()


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
