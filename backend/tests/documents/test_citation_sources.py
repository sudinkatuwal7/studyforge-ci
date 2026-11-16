"""Current source details for citations in Pandu conversation history."""

from unittest.mock import patch

import pytest
from django.core.files.base import ContentFile

from apps.conversations.models import Conversation
from apps.documents.models import Document

pytestmark = pytest.mark.django_db(transaction=True)

def make(owner, *, course=None, conversation=None, title="Lecture 3", suffix=".pdf",
         data=b"%PDF-1.4 lecture bytes"):
    document = Document(owner=owner, course=course, conversation=conversation, title=title,
                        sha256="a" * 64, status=Document.Status.READY)
    document.file.save(f"stored{suffix}", ContentFile(data))
    return document


# --- Citation source details --------------------------------------------------------

def citation(document, page=2):
    return {"chunk_id": 1, "document_id": document.pk, "page_number": page, "excerpt": "text"}


def answer_citing(*documents):
    return {"status": "ANSWERED", "answer": "From your sources.",
            "citations": [citation(document) for document in documents],
            "tool_trace": [{"tool": "search_sources", "sources": {}}]}


def ask_and_history(client, conversation, answer):
    with patch("apps.conversations.views.answer_question", return_value=answer):
        response = client.post(f"/api/v1/conversations/{conversation.pk}/questions/",
                               {"question": "Explain", "document_ids": [1]}, format="json")
    assert response.status_code == 200, response.content
    history = client.get(f"/api/v1/conversations/{conversation.pk}/messages/").json()
    return response.json(), history


def details(citations):
    return [(c["document_name"], c["source_format"], c["available"]) for c in citations]


def test_citations_describe_current_sources_live_and_after_refresh(owner_client, owner, course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    material = make(owner, course=course, title="Lecture 3")
    slides = make(owner, conversation=conversation, title="My slides", suffix=".pptx")
    body, history = ask_and_history(owner_client, conversation, answer_citing(material, slides))
    expected = [("Lecture 3", "pdf", True), ("My slides", "pptx", True)]
    assert details(body["citations"]) == details(body["reply"]["citations"]) == expected
    assert details(history[1]["citations"]) == expected
    # The saved citation fields are unchanged underneath.
    assert body["citations"][0]["page_number"] == 2 and body["citations"][0]["excerpt"] == "text"


def test_renamed_and_deleted_sources_are_shown_as_they_are_now(owner_client, owner, course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    renamed = make(owner, course=course, title="Old name")
    deleted = make(owner, course=course, title="Gone")
    ask_and_history(owner_client, conversation, answer_citing(renamed, deleted))
    Document.objects.filter(pk=renamed.pk).update(title="New name")
    deleted.delete()
    history = owner_client.get(f"/api/v1/conversations/{conversation.pk}/messages/").json()
    assert details(history[1]["citations"]) == [("New name", "pdf", True), (None, None, False)]


def test_citation_to_a_document_that_is_not_the_users_reveals_nothing(owner_client, owner,
                                                                      other_user, course,
                                                                      foreign_course):
    conversation = Conversation.objects.create(owner=owner, course=course)
    foreign = make(other_user, course=foreign_course, title="Someone else's notes")
    body, history = ask_and_history(owner_client, conversation, answer_citing(foreign))
    assert details(body["citations"]) == details(history[1]["citations"]) == [(None, None, False)]


def test_history_describes_all_citations_with_one_source_lookup(owner_client, owner, course,
                                                                django_assert_max_num_queries):
    conversation = Conversation.objects.create(owner=owner, course=course)
    documents = [make(owner, course=course, title=f"Doc {n}") for n in range(4)]
    for document in documents:
        ask_and_history(owner_client, conversation, answer_citing(document))
    # Auth + conversation + messages + one source lookup (owned_conversations is a subquery).
    with django_assert_max_num_queries(5):
        history = owner_client.get(f"/api/v1/conversations/{conversation.pk}/messages/").json()
    assert [c["document_name"] for m in history for c in m["citations"]] == [
        "Doc 0", "Doc 1", "Doc 2", "Doc 3"]
