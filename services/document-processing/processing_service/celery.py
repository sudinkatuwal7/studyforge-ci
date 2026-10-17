"""Celery application for the standalone document processing service."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "processing_service.settings")

app = Celery("document_processing", include=["processing_service.tasks"])
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
