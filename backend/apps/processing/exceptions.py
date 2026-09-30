"""Typed processing errors used to decide retry vs permanent failure."""


class ProcessingError(Exception):
    """Base error for document processing."""

    retryable = False


class RetryableProcessingError(ProcessingError):
    """Temporary failure that may succeed if the task is retried."""

    retryable = True


class PermanentProcessingError(ProcessingError):
    """Unrecoverable failure. Retrying will not help."""

    retryable = False


class DocumentNotFoundError(PermanentProcessingError):
    """No document exists for the given document_id."""


class InvalidPDFError(PermanentProcessingError):
    """The file is missing, unreadable as a PDF, or has no extractable text."""
