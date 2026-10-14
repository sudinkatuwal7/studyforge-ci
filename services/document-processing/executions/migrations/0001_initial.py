import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Execution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('job_id', models.PositiveBigIntegerField(unique=True)),
                ('document_id', models.PositiveBigIntegerField(db_index=True)),
                ('source_sha256', models.CharField(max_length=64, validators=[django.core.validators.RegexValidator('\\A[0-9a-f]{64}\\Z', 'Expected a lowercase SHA-256 digest.')])),
                ('status', models.CharField(choices=[('QUEUED', 'Queued'), ('RUNNING', 'Running'), ('SUCCEEDED', 'Succeeded'), ('FAILED', 'Failed')], db_index=True, default='QUEUED', max_length=16)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('error_code', models.CharField(blank=True, default='', max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'constraints': [models.CheckConstraint(condition=models.Q(('job_id__gt', 0)), name='execution_job_positive'), models.CheckConstraint(condition=models.Q(('document_id__gt', 0)), name='execution_document_positive'), models.CheckConstraint(condition=models.Q(('status__in', ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'])), name='execution_status_valid'), models.CheckConstraint(condition=models.Q(('source_sha256__regex', '^[0-9a-f]{64}$')), name='execution_sha256_valid')],
            },
        ),
    ]
