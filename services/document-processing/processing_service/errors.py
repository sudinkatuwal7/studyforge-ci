"""Processing errors shared by standalone document-processing modules."""


class ProcessingError(Exception):
    """Base processing error."""

    retryable = False


class RetryableProcessingError(ProcessingError):
    """Temporary failure that may succeed if the task is retried."""

    retryable = True


class PermanentProcessingError(ProcessingError):
    """Processing failure that should not be retried."""


class InvalidPDFError(PermanentProcessingError):
    """The source is not a readable, supported PDF."""
