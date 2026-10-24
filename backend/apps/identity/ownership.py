"""Owner and course access rules shared by documents and conversations.

Access is always derived from the authenticated user through Course.owner. A
caller-supplied owner, course, or document ID is never proof of access, and a
foreign object is indistinguishable from a missing one. Database errors are left
to propagate so callers fail closed with their own 503 response.
"""

from django.db.models import Q

from apps.courses.models import Course
from apps.conversations.models import Conversation
from apps.documents.models import Document


def owned_course(user, course_id):
    """Return the user's course, or None when it is missing or foreign."""
    return Course.objects.filter(pk=course_id, owner=user).first()


def owned_documents(user):
    """Documents the user may act on, scoped through their courses."""
    return Document.objects.filter(course__owner=user, conversation__isnull=True)


def owned_conversations(user):
    """Conversations reachable through both their owner and optional course."""
    return Conversation.objects.filter(owner=user).filter(
        Q(course__isnull=True) | Q(course__owner=user)
    )


def owned_conversation(user, conversation_id):
    """A missing or foreign conversation has the same private lookup result."""
    return owned_conversations(user).filter(pk=conversation_id).first()
