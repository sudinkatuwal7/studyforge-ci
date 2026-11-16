"""Saving chat history around a question. The AI call itself happens between
these steps and never inside a database transaction."""

from datetime import timedelta

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from apps.conversations.models import Conversation, ConversationMessage

TITLE_LENGTH = 60
# A question still PENDING after this is reported as FAILED and may be retried.
# A slower attempt that finishes later is still saved (see save_answer).
PENDING_TIMEOUT = timedelta(minutes=2)

Status = ConversationMessage.Status


class QuestionNotRetryable(Exception):
    """The question is answered or still within its answer window."""


def title_from_question(question):
    """A one-line thread title: whitespace collapsed, cut to TITLE_LENGTH."""
    text = " ".join(question.split())
    if len(text) <= TITLE_LENGTH:
        return text
    return text[:TITLE_LENGTH - 1].rstrip() + "…"


def shown_status(message, now=None):
    """The status clients see: a timed-out PENDING question is FAILED."""
    if (message.status == Status.PENDING and message.attempted_at is not None
            and message.attempted_at <= (now or timezone.now()) - PENDING_TIMEOUT):
        return Status.FAILED
    return message.status


def _touch(conversation_id):
    # .update() skips auto_now, so the activity time is set explicitly.
    Conversation.objects.filter(pk=conversation_id).update(updated_at=timezone.now())


def start_question(conversation, question):
    """Save the question as PENDING and, only while the title is blank, name the thread."""
    with transaction.atomic():
        message = ConversationMessage.objects.create(
            conversation=conversation, role=ConversationMessage.Role.USER,
            status=Status.PENDING, content=question, attempted_at=timezone.now(),
        )
        _touch(conversation.pk)
        # The title="" filter makes this a single conditional UPDATE: it names the
        # thread once and never overwrites a title, even with concurrent questions.
        Conversation.objects.filter(pk=conversation.pk, title="").update(
            title=title_from_question(question))
    return message


def start_retry(conversation, message_id):
    """Move a FAILED (or timed-out) question back to PENDING for a new attempt.

    The row lock makes concurrent retries safe: only one starts an attempt, the
    others see a fresh PENDING question and get QuestionNotRetryable.
    """
    with transaction.atomic():
        message = ConversationMessage.objects.select_for_update().filter(
            pk=message_id, conversation=conversation, role=ConversationMessage.Role.USER
        ).first()
        if message is None:
            raise Http404
        if shown_status(message) != Status.FAILED:
            raise QuestionNotRetryable
        message.status = Status.PENDING
        message.attempted_at = timezone.now()
        message.save(update_fields=["status", "attempted_at"])
        _touch(conversation.pk)
    return message


def mark_failed(message):
    """Mark this attempt FAILED, keeping the question in history.

    Matching attempted_at means an older attempt that fails late cannot fail a
    newer retry. No-op if the question was answered or deleted meanwhile.
    """
    ConversationMessage.objects.filter(
        pk=message.pk, status=Status.PENDING, attempted_at=message.attempted_at
    ).update(status=Status.FAILED)


def save_answer(message, result):
    """Save Pandu's reply and mark the question ANSWERED, together.

    Accepted while PENDING or FAILED, so an answer that arrives after the
    timeout is kept. If another attempt already saved a reply, that reply is
    returned unchanged: a question never has two answers. Raises Http404 if the
    conversation (and so the question) was deleted while Pandu was answering.
    """
    with transaction.atomic():
        question = ConversationMessage.objects.select_for_update().filter(
            pk=message.pk, role=ConversationMessage.Role.USER
        ).first()
        if question is None:
            raise Http404
        if question.status == Status.ANSWERED:
            return question, question.reply
        reply = ConversationMessage.objects.create(
            conversation_id=question.conversation_id,
            role=ConversationMessage.Role.ASSISTANT,
            status=result["status"],
            content=result["answer"] or "",
            citations=result["citations"],
            reply_to=question,
        )
        question.status = Status.ANSWERED
        question.save(update_fields=["status"])
        _touch(question.conversation_id)
    return question, reply
