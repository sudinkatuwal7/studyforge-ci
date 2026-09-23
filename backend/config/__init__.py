"""Load the Celery app when Django starts so workers can discover tasks."""

from .celery import app as celery_app

__all__ = ("celery_app",)
