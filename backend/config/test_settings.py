"""Isolated test settings. Use scripts/check.py to supply a fresh database/storage."""

import os
import re

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403

_database_name = os.environ.get("STUDYFORGE_TEST_DB_NAME", "")
_media_root = os.environ.get("STUDYFORGE_TEST_MEDIA_ROOT", "")
if not re.fullmatch(r"studyforge_ci_[0-9a-f]{12}", _database_name) or not _media_root:
    raise ImproperlyConfigured("Run tests with Python 3.12: python scripts/check.py --component backend")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _database_name,
        "USER": os.environ["STUDYFORGE_TEST_DB_USER"],
        "PASSWORD": os.environ["STUDYFORGE_TEST_DB_PASSWORD"],
        "HOST": os.environ["STUDYFORGE_TEST_DB_HOST"],
        "PORT": os.environ["STUDYFORGE_TEST_DB_PORT"],
        "TEST": {"NAME": f"test_{_database_name}"},
    }
}
MEDIA_ROOT = _media_root
os.environ["NOTES_LLM_BACKEND"] = "fake"
for _key in ("OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"):
    os.environ.pop(_key, None)
GEMINI_API_KEY = ""
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
