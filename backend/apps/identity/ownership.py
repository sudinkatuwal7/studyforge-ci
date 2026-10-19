"""Course ownership rules shared by every document operation.

Access is always derived from the authenticated user through Course.owner. A
caller-supplied owner, course, or document ID is never proof of access, and a
foreign object is indistinguishable from a missing one. Database errors are left
to propagate so callers fail closed with their own 503 response.
"""

from apps.courses.models import Course
from apps.documents.models import Document


def owned_course(user, course_id):
    """Return the user's course, or None when it is missing or foreign."""
    return Course.objects.filter(pk=course_id, owner=user).first()


def owned_documents(user):
    """Documents the user may act on, scoped through their courses."""
    return Document.objects.filter(course__owner=user)
