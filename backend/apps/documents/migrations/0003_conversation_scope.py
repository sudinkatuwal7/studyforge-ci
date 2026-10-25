from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("conversations", "0001_initial"),
        ("documents", "0002_job_terminal_callback_sha256"),
    ]

    operations = [
        migrations.AlterField(
            model_name="document", name="course",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="courses.course"),
        ),
        migrations.AddField(
            model_name="document", name="conversation",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="uploads", to="conversations.conversation"),
        ),
        migrations.AddConstraint(
            model_name="document",
            constraint=models.CheckConstraint(
                condition=(models.Q(course__isnull=False, conversation__isnull=True)
                           | models.Q(course__isnull=True, conversation__isnull=False)),
                name="document_exactly_one_scope",
            ),
        ),
    ]
