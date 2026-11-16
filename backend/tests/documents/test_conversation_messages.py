"""SCRUM-24: persistent chat history, failed-question retention, and thread titles."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import IntegrityError, connection, transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.conversations.models import Conversation, ConversationMessage
from apps.conversations.services import (
    PENDING_TIMEOUT, TITLE_LENGTH, mark_failed, save_answer, start_question, start_retry,
    title_from_question,
)
from apps.knowledge.services import RAGServiceError

pytestmark = pytest.mark.django_db(transaction=True)

ANSWER = {
    "status": "ANSWERED", "answer": "Paging maps pages to frames.",
    "citations": [{"chunk_id": 7, "document_id": 3, "page_number": 2,
                   "excerpt": "maps pages to frames"}],
    "tool_trace": [{"tool": "search_sources", "sources": {
        "course_materials": {"documents_searched": 1, "passages_used": 1}}}],
}
NO_CONTEXT = {"status": "INSUFFICIENT_CONTEXT", "answer": None, "citations": [], "tool_trace": []}


def ask(client, conversation, question="Explain paging", document_ids=(1,)):
    return client.post(f"/api/v1/conversations/{conversation.pk}/questions/",
                       {"question": question, "document_ids": list(document_ids)}, format="json")


def history(client, conversation):
    response = client.get(f"/api/v1/conversations/{conversation.pk}/messages/")
    assert response.status_code == 200, response.content
    return response.json()


@pytest.fixture
def conversation(owner, course):
    return Conversation.objects.create(owner=owner, course=course)


def test_answered_question_and_reply_are_saved_in_order(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        response = ask(owner_client, conversation)
    assert response.status_code == 200, response.content
    body = response.json()
    # The existing answer fields are unchanged for current clients.
    assert {key: body[key] for key in ANSWER} == ANSWER
    saved = history(owner_client, conversation)
    assert [(row["role"], row["status"]) for row in saved] == [
        ("user", "ANSWERED"), ("assistant", "ANSWERED")]
    question, reply = saved
    assert question["content"] == "Explain paging" and question["reply_to"] is None
    assert reply["content"] == ANSWER["answer"] and reply["citations"] == ANSWER["citations"]
    assert reply["tool_trace"] == ANSWER["tool_trace"] and question["tool_trace"] == []
    assert reply["reply_to"] == question["id"]
    assert body["question"] == question and body["reply"] == reply


def test_insufficient_context_reply_is_saved_without_text_or_citations(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", return_value=NO_CONTEXT):
        assert ask(owner_client, conversation).status_code == 200
    question, reply = history(owner_client, conversation)
    assert question["status"] == "ANSWERED"
    assert (reply["status"], reply["content"], reply["citations"]) == ("INSUFFICIENT_CONTEXT", "", [])
    assert reply["tool_trace"] == []


def test_failed_answer_keeps_the_question_as_failed(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", side_effect=RAGServiceError("down")):
        response = ask(owner_client, conversation)
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "RAG_GENERATION_FAILED"
    assert body["question"]["status"] == "FAILED"
    # A refresh (a new GET) still shows the question, with no reply.
    assert [(row["role"], row["status"], row["content"]) for row in history(owner_client, conversation)] == [
        ("user", "FAILED", "Explain paging")]


def test_other_errors_also_keep_the_question_as_failed(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", side_effect=Http404):
        assert ask(owner_client, conversation).status_code == 404
    assert [row["status"] for row in history(owner_client, conversation)] == ["FAILED"]


def test_question_is_committed_before_the_ai_call_which_runs_outside_a_transaction(
    owner_client, conversation
):
    seen = {}

    def answer(*args, **kwargs):
        seen["in_transaction"] = connection.in_atomic_block
        seen["saved"] = list(ConversationMessage.objects.values_list("role", "status"))
        return ANSWER

    with patch("apps.conversations.views.answer_question", side_effect=answer):
        assert ask(owner_client, conversation).status_code == 200
    assert seen == {"in_transaction": False, "saved": [("user", "PENDING")]}


def test_invalid_or_foreign_requests_save_nothing(owner_client, owner, other_user, conversation):
    with patch("apps.conversations.views.answer_question", return_value=ANSWER) as answer:
        assert ask(owner_client, conversation, question="   ").status_code == 400
        assert ask(owner_client, conversation, document_ids=()).status_code == 400
        foreign = APIClient()
        foreign.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
        assert ask(foreign, conversation).status_code == 404
        assert foreign.get(f"/api/v1/conversations/{conversation.pk}/messages/").status_code == 404
    assert answer.call_count == 0
    assert not ConversationMessage.objects.exists()
    assert Conversation.objects.get(pk=conversation.pk).title == ""


def test_blank_title_is_set_once_from_the_first_question(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", side_effect=RAGServiceError("down")):
        ask(owner_client, conversation, question="  What   is\n paging?  ")
    # Set even though answering failed: the question itself was saved.
    conversation.refresh_from_db()
    assert conversation.title == "What is paging?"
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        ask(owner_client, conversation, question="And segmentation?")
    conversation.refresh_from_db()
    assert conversation.title == "What is paging?"


def test_existing_title_is_never_replaced(owner_client, owner, course):
    named = Conversation.objects.create(owner=owner, course=course, title="Exam prep")
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        ask(owner_client, named)
    named.refresh_from_db()
    assert named.title == "Exam prep"


def test_long_titles_are_cut_with_an_ellipsis():
    title = title_from_question("word " * 40)
    assert len(title) == TITLE_LENGTH and title.endswith("…")
    assert title_from_question("x" * TITLE_LENGTH) == "x" * TITLE_LENGTH


def test_asking_moves_the_thread_to_the_top_of_the_list(owner_client, owner, course):
    older = Conversation.objects.create(owner=owner, course=course)
    newer = Conversation.objects.create(owner=owner, course=course)
    ids = lambda: [row["id"] for row in owner_client.get("/api/v1/conversations/").json()]
    assert ids() == [newer.pk, older.pk]
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        ask(owner_client, older)
    assert ids() == [older.pk, newer.pk]


def test_no_reply_is_saved_when_the_thread_is_deleted_while_answering(owner_client, conversation):
    def answer(*args, **kwargs):
        Conversation.objects.filter(pk=conversation.pk).delete()
        return ANSWER

    with patch("apps.conversations.views.answer_question", side_effect=answer):
        assert ask(owner_client, conversation).status_code == 404
    assert not ConversationMessage.objects.exists()


def test_deleting_a_thread_deletes_its_history(owner_client, conversation):
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        ask(owner_client, conversation)
    assert owner_client.delete(f"/api/v1/conversations/{conversation.pk}/").status_code == 204
    assert not ConversationMessage.objects.exists()


def test_history_is_separate_per_thread(owner_client, owner, course, conversation):
    other = Conversation.objects.create(owner=owner, course=course)
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        ask(owner_client, conversation, question="First thread")
    assert history(owner_client, other) == []
    assert [row["content"] for row in history(owner_client, conversation)][0] == "First thread"


def test_database_rejects_inconsistent_messages(conversation):
    now = timezone.now()
    question = ConversationMessage.objects.create(
        conversation=conversation, role="user", status="PENDING", content="Q", attempted_at=now)
    for fields in [
        {"role": "assistant", "status": "ANSWERED"},  # reply without a question
        {"role": "user", "status": "INSUFFICIENT_CONTEXT", "attempted_at": now},  # reply status
        {"role": "user", "status": "ANSWERED", "reply_to": question, "attempted_at": now},
        {"role": "user", "status": "PENDING"},  # question without an attempt time
        {"role": "assistant", "status": "ANSWERED", "reply_to": question, "attempted_at": now},
        {"role": "bot", "status": "ANSWERED"},
    ]:
        with pytest.raises(IntegrityError), transaction.atomic():
            ConversationMessage.objects.create(conversation=conversation, content="x", **fields)
    ConversationMessage.objects.create(conversation=conversation, role="assistant",
                                       status="ANSWERED", content="A", reply_to=question)
    with pytest.raises(IntegrityError), transaction.atomic():
        ConversationMessage.objects.create(conversation=conversation, role="assistant",
                                           status="ANSWERED", content="Second", reply_to=question)


# --- Retry and timed-out questions ---------------------------------------------------

def retry(client, conversation, message_id, document_ids=(1,)):
    return client.post(f"/api/v1/conversations/{conversation.pk}/messages/{message_id}/retry/",
                       {"document_ids": list(document_ids)}, format="json")


def failed_question(client, conversation, question="Explain paging"):
    with patch("apps.conversations.views.answer_question", side_effect=RAGServiceError("down")):
        return ask(client, conversation, question=question).json()["question"]["id"]


def aged(message, by):
    ConversationMessage.objects.filter(pk=message.pk).update(attempted_at=timezone.now() - by)
    message.refresh_from_db()
    return message


def test_retry_re_answers_the_same_question_without_a_duplicate(owner_client, conversation):
    question_id = failed_question(owner_client, conversation)
    seen = {}

    def answer(user, document_ids, question, conversation):
        seen.update(question=question, document_ids=document_ids,
                    in_transaction=connection.in_atomic_block,
                    status=ConversationMessage.objects.get(pk=question_id).status)
        return ANSWER

    with patch("apps.conversations.views.answer_question", side_effect=answer):
        response = retry(owner_client, conversation, question_id, document_ids=(4, 5))
    assert response.status_code == 200, response.content
    # The saved text is re-asked with the newly sent sources, outside a transaction,
    # and the question is PENDING (not FAILED) while Pandu answers.
    assert seen == {"question": "Explain paging", "document_ids": [4, 5],
                    "in_transaction": False, "status": "PENDING"}
    body = response.json()
    assert body["question"]["id"] == question_id and body["reply"]["reply_to"] == question_id
    assert [(row["id"], row["role"], row["status"]) for row in history(owner_client, conversation)] == [
        (question_id, "user", "ANSWERED"), (body["reply"]["id"], "assistant", "ANSWERED")]


def test_failed_retry_leaves_the_question_failed(owner_client, conversation):
    question_id = failed_question(owner_client, conversation)
    with patch("apps.conversations.views.answer_question", side_effect=RAGServiceError("down")):
        response = retry(owner_client, conversation, question_id)
    assert response.status_code == 503 and response.json()["question"]["status"] == "FAILED"
    assert [row["status"] for row in history(owner_client, conversation)] == ["FAILED"]


def test_only_failed_or_timed_out_questions_can_be_retried(owner_client, conversation):
    pending = start_question(conversation, "Still answering")
    with patch("apps.conversations.views.answer_question", return_value=ANSWER) as answer:
        ask(owner_client, conversation, question="Answered")
        answered = ConversationMessage.objects.get(content="Answered")
        for message in (pending, answered):
            response = retry(owner_client, conversation, message.pk)
            assert response.status_code == 409
            assert response.json()["code"] == "QUESTION_NOT_RETRYABLE"
        assert answer.call_count == 1  # only the "Answered" question
    pending.refresh_from_db()
    assert pending.status == "PENDING"


def test_retry_hides_foreign_missing_and_non_question_ids(owner_client, owner, other_user,
                                                          course, conversation):
    question_id = failed_question(owner_client, conversation)
    other = Conversation.objects.create(owner=owner, course=course)
    with patch("apps.conversations.views.answer_question", return_value=ANSWER) as answer:
        ok = start_question(other, "Other thread")
        ConversationMessage.objects.filter(pk=ok.pk).update(status="FAILED")
        assert retry(owner_client, conversation, ok.pk).status_code == 404  # wrong thread
        assert retry(owner_client, conversation, "abc").status_code == 404
        assert retry(owner_client, conversation, 9223372036854775807).status_code == 404
        foreign = APIClient()
        foreign.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_user)}")
        assert retry(foreign, conversation, question_id).status_code == 404
        assert retry(owner_client, conversation, question_id, document_ids=()).status_code == 400
        assert answer.call_count == 0
    assert ConversationMessage.objects.get(pk=question_id).status == "FAILED"
    assert not ConversationMessage.objects.filter(role="assistant").exists()


def test_retry_ignores_a_question_text_in_the_body(owner_client, conversation):
    # The saved text is what gets re-answered; a sent question is ignored, not used.
    question_id = failed_question(owner_client, conversation)
    with patch("apps.conversations.views.answer_question", return_value=ANSWER) as answer:
        response = owner_client.post(
            f"/api/v1/conversations/{conversation.pk}/messages/{question_id}/retry/",
            {"question": "Something else", "document_ids": [1]}, format="json")
    assert response.status_code == 200
    assert answer.call_args.args[2] == "Explain paging"


def test_pending_question_is_shown_failed_after_the_timeout_and_can_be_retried(
    owner_client, conversation
):
    question = start_question(conversation, "Lost answer")
    aged(question, PENDING_TIMEOUT - timedelta(seconds=5))
    assert [row["status"] for row in history(owner_client, conversation)] == ["PENDING"]
    aged(question, PENDING_TIMEOUT)
    assert [row["status"] for row in history(owner_client, conversation)] == ["FAILED"]
    # Reading history does not write: the stored row is still PENDING.
    question.refresh_from_db()
    assert question.status == "PENDING"
    with patch("apps.conversations.views.answer_question", return_value=ANSWER):
        assert retry(owner_client, conversation, question.pk).status_code == 200
    assert [row["status"] for row in history(owner_client, conversation)] == ["ANSWERED", "ANSWERED"]


def test_late_answer_after_the_timeout_is_still_saved(conversation):
    question = aged(start_question(conversation, "Slow"), PENDING_TIMEOUT * 2)
    saved, reply = save_answer(question, ANSWER)
    assert saved.status == "ANSWERED" and reply.content == ANSWER["answer"]


def test_two_finishing_attempts_keep_only_the_first_answer(conversation):
    question = start_question(conversation, "Raced")
    _, first = save_answer(question, ANSWER)
    _, second = save_answer(question, NO_CONTEXT)
    assert second.pk == first.pk and second.status == "ANSWERED"
    assert second.tool_trace == ANSWER["tool_trace"]
    assert ConversationMessage.objects.filter(role="assistant").count() == 1


def test_an_old_attempt_failing_late_does_not_fail_the_newer_retry(conversation):
    question = aged(start_question(conversation, "Retried"), PENDING_TIMEOUT * 2)
    old_attempt = ConversationMessage.objects.get(pk=question.pk)
    start_retry(conversation, question.pk)
    mark_failed(old_attempt)
    question.refresh_from_db()
    assert question.status == "PENDING"
    mark_failed(question)
    question.refresh_from_db()
    assert question.status == "FAILED"


def test_late_answer_is_saved_even_after_the_question_was_marked_failed(conversation):
    question = start_question(conversation, "Slow")
    ConversationMessage.objects.filter(pk=question.pk).update(status="FAILED")
    saved, reply = save_answer(question, ANSWER)
    assert saved.status == "ANSWERED" and reply.reply_to_id == question.pk


def test_ai_call_stays_outside_a_transaction_even_with_atomic_requests(
    owner_client, conversation, monkeypatch
):
    # The routes opt out explicitly, so turning ATOMIC_REQUESTS on must not wrap the AI call.
    monkeypatch.setitem(connection.settings_dict, "ATOMIC_REQUESTS", True)
    seen = []

    def answer(*args, **kwargs):
        seen.append(connection.in_atomic_block)
        raise RAGServiceError("down")

    with patch("apps.conversations.views.answer_question", side_effect=answer):
        question_id = ask(owner_client, conversation).json()["question"]["id"]
        retry(owner_client, conversation, question_id)
    assert seen == [False, False]


def test_failure_after_the_thread_was_deleted_returns_404_not_500(owner_client, conversation):
    def answer(*args, **kwargs):
        Conversation.objects.filter(pk=conversation.pk).delete()
        raise RAGServiceError("down")

    with patch("apps.conversations.views.answer_question", side_effect=answer):
        response = ask(owner_client, conversation)
    assert response.status_code == 404
    assert response.json() == {"code": "RESOURCE_NOT_FOUND", "message": "Resource not found."}


def test_old_attempt_finishing_during_a_retry_wins_end_to_end(owner_client, conversation):
    # Attempt A times out; the student retries (B); A finishes while B is still answering.
    question = aged(start_question(conversation, "Explain paging"), PENDING_TIMEOUT * 2)
    attempt_a = ConversationMessage.objects.get(pk=question.pk)

    def attempt_b(*args, **kwargs):
        save_answer(attempt_a, ANSWER)  # A's answer lands first
        return NO_CONTEXT  # B's own result, which must be discarded

    with patch("apps.conversations.views.answer_question", side_effect=attempt_b):
        response = retry(owner_client, conversation, question.pk)
    assert response.status_code == 200, response.content
    body = response.json()
    # B's client gets A's saved answer, matching what a refresh shows.
    assert (body["status"], body["answer"], body["citations"]) == (
        "ANSWERED", ANSWER["answer"], ANSWER["citations"])
    saved = history(owner_client, conversation)
    assert [(row["role"], row["status"], row["content"]) for row in saved] == [
        ("user", "ANSWERED", "Explain paging"), ("assistant", "ANSWERED", ANSWER["answer"])]
    assert body["reply"] == saved[1]
