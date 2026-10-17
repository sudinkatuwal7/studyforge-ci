import uuid

from django.db import migrations, models


def populate_creation_keys(apps, schema_editor):
    TodoItem = apps.get_model("courses", "TodoItem")
    tasks = TodoItem.objects.using(schema_editor.connection.alias)
    # Each existing task needs its own UUID before uniqueness is enforced.
    for task_id in tasks.filter(creation_key__isnull=True).values_list("pk", flat=True).iterator():
        tasks.filter(pk=task_id).update(creation_key=uuid.uuid4())


class Migration(migrations.Migration):
    dependencies = [("courses", "0002_todoitem")]

    operations = [
        migrations.AddField(
            model_name="todoitem",
            name="creation_key",
            field=models.UUIDField(null=True, editable=False),
        ),
        migrations.RunPython(populate_creation_keys, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="todoitem",
            name="creation_key",
            field=models.UUIDField(default=uuid.uuid4, unique=True, editable=False),
        ),
    ]
