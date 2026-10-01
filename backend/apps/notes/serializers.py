from rest_framework import serializers

from apps.notes.models import StudyGuide


class StudyGuideSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyGuide
        fields = ["key_concepts", "important_points", "summary"]
        read_only_fields = fields