"""Standalone configuration: never load main-application settings or models."""

import os

from django.core.exceptions import ImproperlyConfigured


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise ImproperlyConfigured(f"Set {name} for the document processing service.")
    return value


SECRET_KEY = required("PROCESSING_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = os.environ.get(
    "PROCESSING_ALLOWED_HOSTS", "localhost,127.0.0.1,document-processing"
).split(",")
INSTALLED_APPS = ["executions.apps.ExecutionsConfig"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware"]
ROOT_URLCONF = "processing_service.urls"
WSGI_APPLICATION = "processing_service.wsgi.application"
USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("PROCESSING_DB_NAME", "studyforge_processing"),
        "USER": os.environ.get("PROCESSING_DB_USER", "studyforge_processing"),
        "PASSWORD": required("PROCESSING_DB_PASSWORD"),
        "HOST": os.environ.get("PROCESSING_DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("PROCESSING_DB_PORT", "5432"),
        "OPTIONS": {"connect_timeout": 3},
    }
}
PROCESSING_REDIS_URL = os.environ.get("PROCESSING_REDIS_URL", "redis://127.0.0.1:6379/0")
PROCESSING_DJANGO_API_URL = os.environ.get("PROCESSING_DJANGO_API_URL", "")
PROCESSING_SERVICE_TOKEN = os.environ.get("PROCESSING_SERVICE_TOKEN", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIMENSION = int(os.environ.get("EMBEDDING_DIMENSION", "768"))
EMBEDDING_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", "16"))
CELERY_BROKER_URL = PROCESSING_REDIS_URL
CELERY_TASK_IGNORE_RESULT = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_ROUTES = {
    "processing_service.tasks.process_document_task": {
        "queue": "document-processing",
    },
}
