"""Processing-layer status and retry constants.

Status values match the Sprint 1 contract in docs/database-schema.md
and docs/api-contract.md. They are reused here so the processing app
does not invent a second status vocabulary.
"""

STATUS_PENDING = "PENDING"
STATUS_PROCESSING = "PROCESSING"
STATUS_READY = "READY"
STATUS_FAILED = "FAILED"

# Celery retries after the first attempt. Total attempts = 1 + TASK_MAX_RETRIES.
TASK_MAX_RETRIES = 3
TASK_RETRY_COUNTDOWN_SECONDS = 60
