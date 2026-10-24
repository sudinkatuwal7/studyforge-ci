"""Source selection for ordinary RAG and conversation questions."""

from django.db.models import Q

from apps.documents.models import Document


def question_documents(user, conversation=None):
    documents = Document.objects.filter(owner=user)
    if conversation is None:
        return documents.filter(conversation__isnull=True, course__owner=user)
    conversation_uploads = Q(conversation=conversation, conversation__owner=user)
    if conversation.course_id is None:
        return documents.filter(conversation_uploads)
    course_materials = Q(course_id=conversation.course_id, conversation__isnull=True,
                         course__owner=user)
    return documents.filter(conversation_uploads | course_materials)
