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

        try:
            run("config", "--quiet")
            run("up", "-d", "--wait", "--wait-timeout", "120", "db", "redis")
            sql("CREATE TABLE scrum97_isolation_probe (id integer PRIMARY KEY); INSERT INTO scrum97_isolation_probe VALUES (97);")
            run("up", "-d", "--build", "--wait", "--wait-timeout", "120", "document-processing")
            run("run", "--rm", "--no-deps", "processing-db-init")
            assert sql("SELECT id FROM scrum97_isolation_probe") == "97"
            print("[check] Repeat provisioning preserves application data: PASS", flush=True)

            run("exec", "-T", "document-processing", "python", "manage.py", "check")
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
