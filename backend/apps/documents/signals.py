"""Remove private chat files on direct and cascading document deletion."""

from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.documents.models import Document


@receiver(post_delete, sender=Document)
def delete_conversation_upload_file(sender, instance, **kwargs):
    if not instance.conversation_id or not instance.file.name:
        return
    try:
        instance.file.storage.delete(instance.file.name)
    except FileNotFoundError:
        pass
