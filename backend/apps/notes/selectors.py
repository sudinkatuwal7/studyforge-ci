from django.shortcuts import get_object_or_404

from apps.documents.models import Document


def get_owned_document(user, document_id):
    """Fetch a document owned by this user, or raise 404.

    404 rather than 403 so the API never reveals that another student's
    document exists.

    Document carries a direct `owner` FK (SCRUM-9), so ownership is a
    single field check, not a join through Course.
    """
    return get_object_or_404(Document, pk=document_id, owner=user)