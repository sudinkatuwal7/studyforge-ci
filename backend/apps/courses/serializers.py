from rest_framework import serializers

from .models import Course, TodoItem


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
