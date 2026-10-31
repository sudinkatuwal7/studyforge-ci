"""Remove notes built from a material when that material is deleted."""

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from apps.documents.models import Document
from apps.notes.models import CourseNotes


@receiver(pre_delete, sender=Document)
def delete_notes_built_from_document(sender, instance, **kwargs):
    # A signal rather than a call in delete_material, so course deletion and
    # any other cascade are covered. Must run before the join rows disappear.
    CourseNotes.objects.filter(source_documents=instance).delete()
