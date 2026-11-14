from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("executions", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="execution",
            name="callback_payload",
            field=models.TextField(default=None, null=True),
        ),
        migrations.AddField(
            model_name="execution",
            name="delivery_status",
            field=models.CharField(
                choices=[
                    ("NOT_STAGED", "Not Staged"),
                    ("PENDING", "Pending"),
                    ("DELIVERED", "Delivered"),
                    ("REJECTED", "Rejected"),
                ],
                db_index=True,
                default="NOT_STAGED",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="execution",
            name="delivery_attempts",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="execution",
            name="delivered_at",
            field=models.DateTimeField(default=None, null=True),
        ),
        migrations.AddConstraint(
            model_name="execution",
            constraint=models.CheckConstraint(
                condition=models.Q(delivery_status__in=["NOT_STAGED", "PENDING", "DELIVERED", "REJECTED"]),
                name="execution_delivery_status_valid",
            ),
        ),
    ]
