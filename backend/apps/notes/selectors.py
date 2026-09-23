from django.shortcuts import get_object_or_404

from apps.documents.models import Document


def get_owned_document(user, document_id):
    """Fetch a document the user owns, or raise 404.

    The only place that knows how Document links to a user.
    Change the lookup here if SCRUM-9 lands a different relationship.
    """
    return get_object_or_404(Document, pk=document_id, course__owner=user)