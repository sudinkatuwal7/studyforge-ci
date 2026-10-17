"""Verify the foundation in a disposable Compose project, never the developer DB.

Run from any directory with Python and Docker Desktop. No Python packages needed
on the host; service checks execute inside the built image.
"""

import os
from pathlib import Path
import subprocess
import tempfile
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def main():
    project = f"sf-processing-check-{uuid4().hex[:12]}"
    env = os.environ.copy()
    # Override every database/port value used by these Compose files.
    env.update(
        POSTGRES_DB="studyforge_application_check", POSTGRES_USER="studyforge_check_admin",
        POSTGRES_PASSWORD="disposable-admin-only", POSTGRES_PORT="0", REDIS_PORT="0",
        PROCESSING_DB_NAME="studyforge_processing_check", PROCESSING_DB_USER="studyforge_processing_check",
        PROCESSING_DB_PASSWORD="disposable-service-only", PROCESSING_HTTP_PORT="0",
        PROCESSING_SECRET_KEY="disposable-service-check-only",
        PROCESSING_SERVICE_TOKEN="disposable-service-token-only",
        PROCESSING_DJANGO_API_URL="http://127.0.0.1:9",
        GEMINI_API_KEY="",
        EMBEDDING_MODEL="gemini-embedding-2",
        EMBEDDING_DIMENSION="768",
        EMBEDDING_BATCH_SIZE="16",
        PROCESSING_IMAGE="studyforge-document-processing-check:local",
    )
    with tempfile.TemporaryDirectory(prefix="scrum97-") as temporary:
        env_file = Path(temporary) / "empty.env"
        env_file.write_text("# Do not load the developer's .env.\n", encoding="utf-8")
        compose = [
            "docker", "compose", "--env-file", str(env_file), "--project-name", project,
            "-f", str(ROOT / "docker-compose.yml"), "-f", str(ROOT / "docker-compose.processing.yml"),
        ]

        def run(*args, capture=False):
            return subprocess.run(
                [*compose, *args], cwd=ROOT, env=env, check=True, text=True,
                stdout=subprocess.PIPE if capture else None,
            ).stdout

        def sql(statement):
            return run("exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U",
                       env["POSTGRES_USER"], "-d", env["POSTGRES_DB"], "-Atc", statement, capture=True).strip()

        def service_python(code):
            return run("exec", "-T", "document-processing", "python", "-c", code, capture=True).strip()

        def verify_workers_ready():
            ping_command = [
                *compose,
                "exec",
                "-T",
                "processing-worker-1",
                "celery",
                "-A",
                "processing_service.celery:app",
                "inspect",
                "ping",
                "--timeout=2",
            ]
            expected_workers = ("processing-worker-1@", "processing-worker-2@")
            for attempt in range(20):
                result = subprocess.run(
                    ping_command,
                    cwd=ROOT,
                    env=env,
                    check=False,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    timeout=10,
                )
                if result.returncode == 0 and all(
                    worker in result.stdout for worker in expected_workers
                ):
                    registered_command = [
                        *compose,
                        "exec",
                        "-T",
                        "processing-worker-1",
                        "celery",
                        "-A",
                        "processing_service.celery:app",
                        "inspect",
                        "registered",
                        "--timeout=2",
                    ]
                    registered = subprocess.run(
                        registered_command,
                        cwd=ROOT,
                        env=env,
                        check=False,
                        text=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        timeout=10,
                    )
                    task_name = "processing_service.tasks.process_document_task"
                    if registered.returncode != 0 or registered.stdout.count(task_name) < 2:
                        raise RuntimeError(
                            "The document task was not registered by both workers. "
                            f"Output: {registered.stdout}"
                        )
                    queues_command = [
                        *compose,
                        "exec",
                        "-T",
                        "processing-worker-1",
                        "celery",
                        "-A",
                        "processing_service.celery:app",
                        "inspect",
                        "active_queues",
                        "--timeout=2",
                    ]
                    queues = subprocess.run(
                        queues_command,
                        cwd=ROOT,
                        env=env,
                        check=False,
                        text=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        timeout=10,
                    )
                    queue_name = "document-processing"
                    if queues.returncode != 0 or queues.stdout.count(queue_name) < 2:
                        raise RuntimeError(
                            "Both workers must subscribe to the document-processing queue. "
                            f"Output: {queues.stdout}"
                        )
                    print(
                        "[check] Both Celery workers respond, register the document task, "
                        "and consume the isolated queue: PASS",
                        flush=True,
                    )
                    return
                time.sleep(1)
            raise RuntimeError(
                "Both processing workers did not respond to Celery ping. "
                f"Last output: {result.stdout}"
            )

        try:
            run("config", "--quiet")
            run("up", "-d", "--wait", "--wait-timeout", "120", "db", "redis")
            sql("CREATE TABLE scrum97_isolation_probe (id integer PRIMARY KEY); INSERT INTO scrum97_isolation_probe VALUES (97);")
            run(
                "up", "-d", "--build", "--wait", "--wait-timeout", "120",
                "document-processing", "processing-worker-1", "processing-worker-2",
            )
            verify_workers_ready()
            for worker in ("processing-worker-1", "processing-worker-2"):
                run(
                    "exec", "-T", worker, "python", "manage.py", "test",
                    "processing_service.tests", "--noinput",
                )
                print(
                    f"[check] Extraction/chunking tests in {worker}: PASS",
                    flush=True,
                )
            run("run", "--rm", "--no-deps", "processing-db-init")
            assert sql("SELECT id FROM scrum97_isolation_probe") == "97"
            print("[check] Repeat provisioning preserves application data: PASS", flush=True)

            run("exec", "-T", "document-processing", "python", "manage.py", "check")
            run(
                "exec", "-T", "document-processing", "python", "manage.py", "test",
                "processing_service.tests", "--noinput",
            )
            run("exec", "-T", "document-processing", "python", "manage.py", "makemigrations", "--check", "--dry-run")
            sql("CREATE DATABASE test_studyforge_processing_check OWNER studyforge_processing_check;")
            run("exec", "-T", "document-processing", "python", "manage.py", "test", "executions", "--keepdb", "--noinput", "-v", "2")

            # Only this disposable application database is contacted here, to
            # verify the service account cannot read its sentinel table.
            isolation = service_python('''
import os
import psycopg
assert "PROCESSING_DB_ADMIN_PASSWORD" not in os.environ
with psycopg.connect(host="db", dbname="studyforge_application_check",
                     user=os.environ["PROCESSING_DB_USER"], password=os.environ["PROCESSING_DB_PASSWORD"]) as connection:
    flags = connection.execute("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user").fetchone()
    assert flags == (False, False, False, False, False)
    try:
        connection.execute("SELECT * FROM scrum97_isolation_probe")
    except psycopg.errors.InsufficientPrivilege:
        print("restricted")
    else:
        raise AssertionError("Service role can read application data")
''')
            assert isolation == "restricted"
            print("[check] Service role cannot read application tables; no admin credentials: PASS", flush=True)

            service_python('''
import os
os.environ["DJANGO_SETTINGS_MODULE"] = "processing_service.settings"
import django
django.setup()
from executions.models import Execution
Execution.objects.create(job_id=97, document_id=97, source_sha256="a" * 64)
''')
            run("restart", "document-processing")
            for attempt in range(30):
                result = subprocess.run([
                    *compose, "exec", "-T", "document-processing", "python", "-c",
                    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/ready/', timeout=8).close()",
                ], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("Service did not become ready after restart.")
            service_python('''
import os
os.environ["DJANGO_SETTINGS_MODULE"] = "processing_service.settings"
import django
django.setup()
from executions.models import Execution
assert Execution.objects.get(job_id=97).document_id == 97
''')
            print("[check] Execution persists across service restart: PASS", flush=True)

            run("stop", "redis")
            service_python('''
import json
import urllib.request
from urllib.error import HTTPError
assert urllib.request.urlopen("http://127.0.0.1:8001/health/").status == 200
try:
    urllib.request.urlopen("http://127.0.0.1:8001/ready/", timeout=10)
except HTTPError as error:
    assert error.code == 503
    assert json.load(error)["dependencies"]["redis"] == "unavailable"
else:
    raise AssertionError("Readiness must fail during a Redis outage")
''')
            print("[check] Actual Redis outage: liveness 200, readiness 503: PASS", flush=True)
            print("[check] SCRUM-97 foundation checks passed.", flush=True)
        finally:
            # The random project above is created by this invocation; no shared
            # development containers or volumes belong to it.
            run("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
