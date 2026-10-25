"""A private chat scope. Message persistence belongs to SCRUM-75."""

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations"
    )
    course = models.ForeignKey(
        "courses.Course", on_delete=models.CASCADE, related_name="conversations",
        null=True, blank=True,
    )
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
