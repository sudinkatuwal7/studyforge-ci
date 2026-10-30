from django.http import Http404

from apps.documents.models import Document


def get_owned_course_documents(user, course, document_ids):
    """The requested documents, in request order, or raise 404.

    One query. Any id that is missing, owned by someone else, or in a
    different course fails the whole request, and the error does not say
    which id it was.
    """
    documents = Document.objects.filter(pk__in=document_ids, owner=user, course=course,
                                        conversation__isnull=True)
    by_id = {document.pk: document for document in documents}
    if len(by_id) != len(document_ids):
        raise Http404("No such documents.")
    return [by_id[document_id] for document_id in document_ids]
