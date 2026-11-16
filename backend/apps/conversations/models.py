"""A private chat scope and its saved question/answer history."""

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


class ConversationMessage(models.Model):
    """One saved chat turn. Ownership comes from the conversation, not a column here.

    A student question is saved as PENDING before Pandu is called, so a refresh
    still shows it if answering fails (FAILED). Pandu's reply is saved only after
    a successful answer and points at the question it answers. attempted_at is
    when the latest answer attempt started (first ask or retry); a PENDING
    question older than PENDING_TIMEOUT is reported as FAILED.
    """

    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    class Status(models.TextChoices):
        # Student questions.
        PENDING = "PENDING", "Pending"
        ANSWERED = "ANSWERED", "Answered"
        FAILED = "FAILED", "Failed"
        # Pandu replies use ANSWERED or INSUFFICIENT_CONTEXT, as the question API does.
        INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT", "Insufficient context"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    status = models.CharField(max_length=32, choices=Status.choices)
    content = models.TextField(blank=True)
    citations = models.JSONField(default=list, blank=True)
    # Replies only: one entry per tool call that produced the answer, e.g.
    # [{"tool": "search_sources", "sources": {"course_materials":
    #   {"documents_searched": 2, "passages_used": 3}}}].
    tool_trace = models.JSONField(default=list, blank=True)
    # One reply per question, enforced by the database.
    reply_to = models.OneToOneField(
        "self", on_delete=models.CASCADE, related_name="reply", null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    attempted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "created_at", "id"],
                         name="conv_message_history_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(role="user", reply_to__isnull=True, attempted_at__isnull=False,
                             status__in=["PENDING", "ANSWERED", "FAILED"])
                    | models.Q(role="assistant", reply_to__isnull=False, attempted_at__isnull=True,
                               status__in=["ANSWERED", "INSUFFICIENT_CONTEXT"])
                ),
                name="conv_message_role_status_valid",
            ),
        ]
