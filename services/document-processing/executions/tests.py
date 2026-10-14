from unittest.mock import patch

from django.db import IntegrityError, OperationalError, connection, transaction
from django.test import TestCase
from redis.exceptions import ConnectionError as RedisConnectionError

from .models import Execution


class ExecutionPersistenceTests(TestCase):
    def create_execution(self, **changes):
        values = {"job_id": 101, "document_id": 42, "source_sha256": "a" * 64}
        values.update(changes)
        return Execution.objects.create(**values)

    def test_duplicate_job_cannot_create_a_second_execution(self):
        first = self.create_execution()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_execution(document_id=99)
        first.refresh_from_db()
        self.assertEqual(first.document_id, 42)
        self.assertEqual(Execution.objects.count(), 1)

    def test_new_job_can_reprocess_same_document(self):
        self.create_execution()
        second = self.create_execution(job_id=102)
        self.assertEqual(second.status, Execution.Status.QUEUED)
        self.assertEqual(second.attempts, 0)
        self.assertEqual(Execution.objects.filter(document_id=42).count(), 2)

    def test_database_rejects_invalid_execution_records(self):
        for invalid in (
            {"job_id": 0}, {"document_id": 0}, {"attempts": -1},
            {"status": "READY"}, {"source_sha256": "not-a-digest"},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(IntegrityError), transaction.atomic():
                self.create_execution(**invalid)

    def test_migrations_create_no_application_tables_or_foreign_keys(self):
        self.assertEqual(set(connection.introspection.table_names()), {"django_migrations", "executions_execution"})
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, "executions_execution")
        self.assertFalse(any(item["foreign_key"] for item in constraints.values()))


class HealthTests(TestCase):
    def test_liveness_does_not_query_dependencies(self):
        with patch("processing_service.health.Execution.objects.exists") as database, patch(
            "processing_service.health.Redis.from_url"
        ) as redis:
            response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        database.assert_not_called()
        redis.assert_not_called()

    def test_readiness_checks_migrated_database_and_redis(self):
        with patch("processing_service.health.Redis.from_url") as redis:
            response = self.client.get("/ready/")
        redis.return_value.__enter__.return_value.ping.assert_called_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dependencies"], {"database": "ok", "redis": "ok"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_missing_database_is_unready_without_leaking_details(self):
        with patch("processing_service.health.Execution.objects.exists", side_effect=OperationalError("private detail")), patch(
            "processing_service.health.Redis.from_url"
        ):
            response = self.client.get("/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["dependencies"]["database"], "unavailable")
        self.assertNotContains(response, "private detail", status_code=503)

    def test_redis_outage_is_unready_without_leaking_details(self):
        with patch("processing_service.health.Redis.from_url", side_effect=RedisConnectionError("private detail")):
            response = self.client.get("/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["dependencies"]["redis"], "unavailable")
        self.assertNotContains(response, "private detail", status_code=503)

    def test_health_routes_are_read_only(self):
        for path in ("/health/", "/ready/"):
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path).status_code, 405)
