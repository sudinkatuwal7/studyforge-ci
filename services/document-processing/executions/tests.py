import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from celery.exceptions import Retry

from django.db import IntegrityError, OperationalError, close_old_connections, connection, connections, transaction
from django.test import TestCase, TransactionTestCase
from redis.exceptions import ConnectionError as RedisConnectionError

from .models import Execution

from processing_service import execution_store
from processing_service.chunking import TextChunk
from processing_service.errors import OversizedCallbackError, PermanentProcessingError, RetryableProcessingError
from processing_service.pdf_parser import ExtractionResult, PageText
from processing_service.source_client import SourceDocument
from processing_service.tasks import process_document_task


DIGEST = "a" * 64


def terminal_payload(job_id=101, document_id=42, attempt=1, status="SUCCEEDED"):
    envelope = {
        "schema_version": 1, "job_id": job_id, "document_id": document_id,
        "source_sha256": DIGEST, "attempt": attempt, "status": status,
    }
    if status == "FAILED":
        return {**envelope, "error_code": "PROCESSING_FAILED"}
    return {
        **envelope, "page_count": 1, "likely_scanned": False,
        "chunks": [{"page_number": 1, "content": "page text", "embedding": [0.5] * 768}],
    }


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

    def test_new_execution_has_independent_delivery_defaults(self):
        execution = self.create_execution()
        self.assertEqual(execution.status, Execution.Status.QUEUED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.NOT_STAGED)
        self.assertEqual(execution.attempts, 0)
        self.assertEqual(execution.delivery_attempts, 0)
        self.assertIsNone(execution.callback_payload)
        self.assertIsNone(execution.delivered_at)

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


class ExecutionStoreTests(TestCase):
    def setUp(self):
        self.execution = execution_store.get_or_create_execution(101, 42, DIGEST)

    def test_identity_cannot_be_rebound_to_another_document_or_digest(self):
        with self.assertRaises(PermanentProcessingError):
            execution_store.get_or_create_execution(101, 43, DIGEST)
        with self.assertRaises(PermanentProcessingError):
            execution_store.get_or_create_execution(101, 42, "b" * 64)
        self.execution.refresh_from_db()
        self.assertEqual(self.execution.document_id, 42)

    def test_staged_payload_survives_reload_and_first_terminal_result_wins(self):
        attempt, saved = execution_store.start_or_resume(101)
        self.assertEqual((attempt, saved), (1, None))
        first = terminal_payload()
        self.assertEqual(execution_store.stage_terminal(101, first), first)
        second = terminal_payload(status="FAILED")
        self.assertEqual(execution_store.stage_terminal(101, second), first)
        self.execution.refresh_from_db()
        self.assertEqual(json.loads(self.execution.callback_payload), first)
        self.assertEqual(self.execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(self.execution.delivery_status, Execution.DeliveryStatus.PENDING)
        self.assertEqual(self.execution.attempts, 1)
        self.assertEqual(self.execution.delivery_attempts, 0)
        self.assertEqual(execution_store.start_or_resume(101), (None, first))

    def test_oversized_later_result_cannot_displace_staged_payload(self):
        execution_store.start_or_resume(101)
        first = terminal_payload()
        execution_store.stage_terminal(101, first)
        oversized = {**terminal_payload(status="FAILED"), "padding": "x" * (2 * 1024 * 1024)}
        self.assertEqual(execution_store.stage_terminal(101, oversized), first)
        self.execution.refresh_from_db()
        self.assertEqual(json.loads(self.execution.callback_payload), first)
        self.assertEqual(self.execution.status, Execution.Status.SUCCEEDED)

    def test_processing_and_delivery_attempts_advance_independently(self):
        self.assertEqual(execution_store.start_or_resume(101), (1, None))
        execution_store.prepare_processing_retry(101)
        self.assertEqual(execution_store.start_or_resume(101), (2, None))
        execution_store.stage_terminal(101, terminal_payload(attempt=2))
        payload, status, count, should_send = execution_store.begin_delivery(101, 4)
        self.assertEqual(payload["attempt"], 2)
        self.assertEqual((status, count, should_send), ("PENDING", 1, True))
        self.execution.refresh_from_db()
        self.assertEqual(self.execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(self.execution.attempts, 2)
        self.assertEqual(self.execution.delivery_attempts, 1)
        self.assertEqual(self.execution.delivery_status, Execution.DeliveryStatus.PENDING)
        execution_store.mark_delivered(101)
        self.execution.refresh_from_db()
        self.assertEqual(self.execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertIsNotNone(self.execution.delivered_at)
        self.assertEqual(self.execution.status, Execution.Status.SUCCEEDED)

    def test_permanent_rejection_does_not_rewrite_processing_status(self):
        execution_store.start_or_resume(101)
        execution_store.stage_terminal(101, terminal_payload())
        execution_store.begin_delivery(101, 4)
        execution_store.mark_rejected(101)
        self.execution.refresh_from_db()
        self.assertEqual(self.execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(self.execution.delivery_status, Execution.DeliveryStatus.REJECTED)
        self.assertIsNone(self.execution.delivered_at)

    def test_oversized_callback_is_rejected_before_staging(self):
        execution_store.start_or_resume(101)
        oversized = {**terminal_payload(), "chunks": [{"content": "x" * (2 * 1024 * 1024)}]}
        with self.assertRaises(OversizedCallbackError):
            execution_store.stage_terminal(101, oversized)
        self.execution.refresh_from_db()
        self.assertEqual(self.execution.status, Execution.Status.RUNNING)
        self.assertEqual(self.execution.delivery_status, Execution.DeliveryStatus.NOT_STAGED)
        self.assertIsNone(self.execution.callback_payload)


class ExecutionConcurrencyTests(TransactionTestCase):
    def test_concurrent_conflicting_terminal_staging_keeps_first_payload(self):
        execution_store.get_or_create_execution(101, 42, DIGEST)
        execution_store.start_or_resume(101)
        barrier = Barrier(2)

        def stage(payload):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return execution_store.stage_terminal(101, payload)
            finally:
                connections.close_all()

        success = terminal_payload()
        failure = terminal_payload(status="FAILED")
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(stage, success)
            second = pool.submit(stage, failure)
            results = [first.result(timeout=20), second.result(timeout=20)]

        execution = Execution.objects.get(job_id=101)
        self.assertIn(results[0], (success, failure))
        self.assertEqual(results[0], results[1])
        self.assertEqual(json.loads(execution.callback_payload), results[0])
        self.assertEqual(execution.status, results[0]["status"])
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.PENDING)


class WorkerExecutionTests(TestCase):
    def run_worker(self, callback):
        extraction = ExtractionResult(
            text="page text", page_count=1,
            pages=[PageText(page_number=1, text="page text")],
        )
        with (
            patch("processing_service.tasks.fetch_source_document", return_value=SourceDocument(b"%PDF", "application/pdf")) as fetch,
            patch("processing_service.tasks.extract_document", return_value=extraction) as extract,
            patch("processing_service.tasks.chunk_pages", return_value=[TextChunk(1, "page text")]) as chunk,
            patch("processing_service.tasks.embed_texts", return_value=[[0.5] * 768]) as embed,
            patch("processing_service.tasks.submit_callback", side_effect=callback) as send,
        ):
            result = process_document_task.run(101, 42, DIGEST)
        return result, fetch, extract, chunk, embed, send

    def test_worker_creates_execution_and_stages_success_before_http(self):
        def callback(_job_id, payload):
            if payload["status"] == "SUCCEEDED":
                execution = Execution.objects.get(job_id=101)
                self.assertEqual(execution.status, Execution.Status.SUCCEEDED)
                self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.PENDING)
                self.assertEqual(json.loads(execution.callback_payload), payload)
                self.assertEqual(execution.delivery_attempts, 1)
            return "applied"

        result, fetch, extract, chunk, embed, send = self.run_worker(callback)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(result["attempt"], 1)
        self.assertEqual(send.call_count, 2)
        fetch.assert_called_once()
        extract.assert_called_once()
        chunk.assert_called_once()
        embed.assert_called_once()
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertEqual(execution.attempts, 1)
        self.assertEqual(execution.delivery_attempts, 1)
        self.assertIsNotNone(execution.delivered_at)

    def test_processing_failure_stages_safe_failed_result(self):
        with (
            patch("processing_service.tasks.fetch_source_document", side_effect=ValueError("private detail")),
            patch("processing_service.tasks.submit_callback", return_value="applied") as send,
        ):
            with self.assertRaisesRegex(ValueError, "private detail"):
                process_document_task.run(101, 42, DIGEST)
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.FAILED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertEqual(json.loads(execution.callback_payload), terminal_payload(status="FAILED"))
        self.assertEqual(send.call_args.args[1]["error_code"], "PROCESSING_FAILED")
        self.assertNotIn("private", execution.callback_payload)

    def test_temporary_callback_outage_replays_saved_result_without_reprocessing(self):
        def unavailable(_job_id, payload):
            if payload["status"] == "SUCCEEDED":
                raise RetryableProcessingError("Django temporarily unavailable")
            return "applied"

        with patch.object(process_document_task, "retry", side_effect=Retry()) as retry:
            with self.assertRaises(Retry):
                self.run_worker(unavailable)
        retry.assert_called_once()
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.PENDING)
        self.assertEqual(execution.attempts, 1)
        self.assertEqual(execution.delivery_attempts, 1)
        staged = json.loads(execution.callback_payload)

        with (
            patch("processing_service.tasks.fetch_source_document") as fetch,
            patch("processing_service.tasks.extract_document") as extract,
            patch("processing_service.tasks.chunk_pages") as chunk,
            patch("processing_service.tasks.embed_texts") as embed,
            patch("processing_service.tasks.submit_callback", return_value="duplicate") as send,
        ):
            result = process_document_task.run(101, 42, DIGEST)
        self.assertEqual(result, staged)
        self.assertEqual(send.call_args.args[1], staged)
        self.assertEqual(send.call_args.args[1]["attempt"], 1)
        self.assertEqual(send.call_count, 1)
        fetch.assert_not_called()
        extract.assert_not_called()
        chunk.assert_not_called()
        embed.assert_not_called()
        execution.refresh_from_db()
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertEqual(execution.delivery_attempts, 2)
        self.assertEqual(execution.attempts, 1)

    def test_failed_processing_callback_retries_without_repeating_source_work(self):
        def unavailable(_job_id, payload):
            if payload["status"] == "FAILED":
                raise RetryableProcessingError("Django temporarily unavailable")
            return "applied"

        with (
            patch("processing_service.tasks.fetch_source_document", side_effect=ValueError("private detail")) as fetch,
            patch("processing_service.tasks.submit_callback", side_effect=unavailable),
            patch.object(process_document_task, "retry", side_effect=Retry()),
        ):
            with self.assertRaises(Retry):
                process_document_task.run(101, 42, DIGEST)
        fetch.assert_called_once()
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.FAILED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.PENDING)
        staged = json.loads(execution.callback_payload)
        self.assertEqual(staged["error_code"], "PROCESSING_FAILED")

        with (
            patch("processing_service.tasks.fetch_source_document") as fetch,
            patch("processing_service.tasks.extract_document") as extract,
            patch("processing_service.tasks.embed_texts") as embed,
            patch("processing_service.tasks.submit_callback", return_value="applied") as send,
        ):
            self.assertEqual(process_document_task.run(101, 42, DIGEST), staged)
        fetch.assert_not_called()
        extract.assert_not_called()
        embed.assert_not_called()
        self.assertEqual(send.call_args.args[1], staged)
        execution.refresh_from_db()
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertEqual(execution.delivery_attempts, 2)
        self.assertEqual(execution.attempts, 1)

    def test_oversized_generated_result_stages_only_safe_failure(self):
        extraction = ExtractionResult(
            text="page text", page_count=1,
            pages=[PageText(page_number=1, text="page text")],
        )
        with (
            patch("processing_service.tasks.fetch_source_document", return_value=SourceDocument(b"%PDF", "application/pdf")),
            patch("processing_service.tasks.extract_document", return_value=extraction),
            patch("processing_service.tasks.chunk_pages", return_value=[TextChunk(1, "x" * (2 * 1024 * 1024))]),
            patch("processing_service.tasks.embed_texts", return_value=[[0.5] * 768]),
            patch("processing_service.tasks.submit_callback", return_value="applied") as send,
        ):
            with self.assertRaises(OversizedCallbackError):
                process_document_task.run(101, 42, DIGEST)
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.FAILED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.DELIVERED)
        self.assertEqual(json.loads(execution.callback_payload), terminal_payload(status="FAILED"))
        self.assertEqual([call.args[1]["status"] for call in send.call_args_list], ["RUNNING", "FAILED"])

    def test_permanent_callback_rejection_does_not_change_successful_processing(self):
        def rejected(_job_id, payload):
            if payload["status"] == "SUCCEEDED":
                raise PermanentProcessingError("Django rejected callback")
            return "applied"

        with self.assertRaises(PermanentProcessingError):
            self.run_worker(rejected)
        execution = Execution.objects.get(job_id=101)
        self.assertEqual(execution.status, Execution.Status.SUCCEEDED)
        self.assertEqual(execution.delivery_status, Execution.DeliveryStatus.REJECTED)
        self.assertEqual(execution.delivery_attempts, 1)
        self.assertIsNone(execution.delivered_at)


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
