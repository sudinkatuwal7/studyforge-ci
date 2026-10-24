"""Private conversation and upload APIs for SCRUM-75 to consume."""

from django.db import transaction
from django.http import Http404
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from apps.conversations.models import Conversation
from apps.conversations.serializers import (
    ConversationCreateSerializer, ConversationSerializer, ConversationUploadSerializer,
)
from apps.documents.models import Document
from apps.documents.services import store_and_dispatch
from apps.documents.views import DocumentAPIView, read_upload, resource_id
from apps.identity.ownership import owned_conversation, owned_conversations, owned_course
from apps.knowledge.serializers import RAGQuerySerializer
from apps.knowledge.services import RAGServiceError, answer_question


def conversation_for_request(request, conversation_id):
    conversation = owned_conversation(request.user, resource_id(conversation_id))
    if conversation is None:
        raise Http404
    return conversation


class ConversationListView(DocumentAPIView):
    parser_classes = [JSONParser]

    def get(self, request):
        conversations = owned_conversations(request.user).order_by("-updated_at", "-pk")
        return Response(ConversationSerializer(conversations, many=True).data)

    def post(self, request):
        if not isinstance(request.data, dict) or set(request.data) - {"course_id", "title"}:
            return Response({"detail": "Only course_id and title are accepted."}, status=400)
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        course = None
        if data.get("course_id") is not None:
            course = owned_course(request.user, data["course_id"])
            if course is None:
                raise Http404
        conversation = Conversation.objects.create(
            owner=request.user, course=course, title=data["title"]
        )
        return Response(ConversationSerializer(conversation).data, status=201)


class ConversationDetailView(DocumentAPIView):
    parser_classes = [JSONParser]

    def get(self, request, conversation_id):
        return Response(ConversationSerializer(conversation_for_request(request, conversation_id)).data)

    def delete(self, request, conversation_id):
        conversation = conversation_for_request(request, conversation_id)
        with transaction.atomic():
            conversation.delete()
        return Response(status=204)


class ConversationDocumentsView(DocumentAPIView):
    def get(self, request, conversation_id):
        conversation = conversation_for_request(request, conversation_id)
        uploads = Document.objects.filter(conversation=conversation, owner=request.user).order_by(
            "-created_at", "-pk"
        )
        return Response(ConversationUploadSerializer(uploads, many=True).data)

    def post(self, request, conversation_id):
        conversation = conversation_for_request(request, conversation_id)
        upload, title, sha256, suffix = read_upload(request)
        snapshot = store_and_dispatch(conversation=conversation, upload=upload,
                                      title=title, sha256=sha256, suffix=suffix)
        return Response({**snapshot, "conversation_id": conversation.pk}, status=201)


class ConversationDocumentDetailView(DocumentAPIView):
    def get_document(self, request, conversation_id, document_id):
        conversation = conversation_for_request(request, conversation_id)
        document = Document.objects.filter(
            pk=resource_id(document_id), owner=request.user, conversation=conversation
        ).first()
        if document is None:
            raise Http404
        return document

    def get(self, request, conversation_id, document_id):
        return Response(ConversationUploadSerializer(
            self.get_document(request, conversation_id, document_id)
        ).data)

    def delete(self, request, conversation_id, document_id):
        document = self.get_document(request, conversation_id, document_id)
        with transaction.atomic():
            document.delete()
        return Response(status=204)


class ConversationQuestionView(DocumentAPIView):
    parser_classes = [JSONParser]

    def post(self, request, conversation_id):
        conversation = conversation_for_request(request, conversation_id)
        serializer = RAGQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = answer_question(request.user, data["document_ids"], data["question"],
                                     conversation=conversation)
        except RAGServiceError:
            return Response({"code": "RAG_GENERATION_FAILED",
                             "detail": "The question could not be answered right now. Please try again."},
                            status=503)
        return Response(result)
