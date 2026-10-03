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

# Average extracted characters per page below this value is treated as likely scanned.
# A real text page is typically hundreds of characters; a scan's text layer is near empty.
SCANNED_TEXT_THRESHOLD_PER_PAGE = 50

# Character windows for one PDF page. Overlap must stay smaller than the window.
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
