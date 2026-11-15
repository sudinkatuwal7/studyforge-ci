"""Opt-in live document-processing smoke test.

Run with a Python environment containing backend and document-processing
requirements, plus Docker Compose:

    python scripts/check_processing_live.py

This creates a disposable Compose project, two databases, a real Django HTTP
server, and a standalone Celery worker. Only external AI provider functions
are replaced in the child processes. It is deliberately outside pytest and
scripts/check.py.
"""

from __future__ import annotations

import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
SERVICE = ROOT / "services" / "document-processing"
TASK_NAME = "processing_service.tasks.process_document_task"
QUEUE_NAME = "document-processing"
PDF_TEXT = "StudyForge live processing lecture on page faults"
VECTOR = [0.25] * 768


class FakeGeminiClient:
    """Replace the Gemini SDK call while exercising both embedding adapters."""

    def __init__(self, *, api_key):
        assert api_key == "live-smoke-fake-key"
        self.models = self

    def embed_content(self, *, model, contents, config):
        assert model == "gemini-embedding-2"
        assert config.output_dimensionality == len(VECTOR)
        assert contents and all(
            content.parts[0].text.strip() for content in contents
        )
        return SimpleNamespace(embeddings=[
            SimpleNamespace(values=list(VECTOR)) for _ in contents
        ])


class FakeRAGAnswer:
    """Replace only the external answer provider; cite actual retrieved text."""

    def generate(self, question, passages):
        passage = passages[0]
        return {
            "status": "ANSWERED",
            "answer": "The processed lecture describes page faults.",
            "citations": [{
                "chunk_id": passage["chunk_id"],
                "document_id": passage["document_id"],
                "page_number": passage["page_number"],
                "excerpt": passage["content"][:80],
            }],
        }


def django_server(port):
    sys.path.insert(0, str(BACKEND))
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django

    django.setup()
    from apps.knowledge import llm, query_embeddings
    from django.core.management import execute_from_command_line

    query_embeddings.genai.Client = FakeGeminiClient
    llm.get_client = FakeRAGAnswer
    execute_from_command_line([
        "manage.py", "runserver", f"127.0.0.1:{port}", "--noreload",
    ])


def processing_worker():
    sys.path.insert(0, str(SERVICE))
    os.environ["DJANGO_SETTINGS_MODULE"] = "processing_service.settings"
    import django

    django.setup()
    from processing_service import embedding_service
    from processing_service.celery import app

    embedding_service.genai.Client = FakeGeminiClient
    app.worker_main([
        "worker", "--pool=solo", "--concurrency=1", f"--queues={QUEUE_NAME}",
        "--hostname=processing-live@%h", "--loglevel=INFO",
    ])


def free_local_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def make_pdf():
    """Build a real one-page text PDF, using the existing test fixture method."""
    from io import BytesIO
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=500, height=200)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): writer._add_object(font),
        }),
    })
    content = DecodedStreamObject()
    content.set_data(
        f"BT /F1 12 Tf 10 100 Td ({PDF_TEXT}) Tj ET".encode("ascii")
    )
    page[NameObject("/Contents")] = writer._add_object(content)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def run(command, *, cwd=ROOT, env=None, timeout=120):
    result = subprocess.run(
        command, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(map(str, command))}\n"
            f"{result.stdout[-5000:]}"
        )
    return result.stdout


def compose_port(compose, service, container_port, env):
    output = run(
        [*compose, "port", service, str(container_port)], env=env,
    )
    for line in output.splitlines():
        if line.startswith("0.0.0.0:") or line.startswith("127.0.0.1:"):
            return line.rsplit(":", 1)[-1]
    raise RuntimeError(f"No IPv4 port published for {service}: {output}")


def wait_for_http(base_url, server, deadline_seconds=45):
    import httpx

    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"Django HTTP server exited ({server.returncode}).")
        try:
            response = httpx.get(f"{base_url}/api/v1/health/", timeout=2)
            if response.status_code == 200 and response.json() == {"status": "ok"}:
                return
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(0.5)
    raise RuntimeError("Django HTTP server did not become ready.")


def wait_for_worker(worker, env, deadline_seconds=60):
    deadline = time.monotonic() + deadline_seconds
    inspect = [
        sys.executable, "-m", "celery", "-A", "processing_service.celery:app",
        "inspect",
    ]
    while time.monotonic() < deadline:
        if worker.poll() is not None:
            raise RuntimeError(f"Processing worker exited ({worker.returncode}).")
        result = subprocess.run(
            [*inspect, "registered", "--timeout=2"], cwd=SERVICE, env=env,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=10,
        )
        if result.returncode == 0 and TASK_NAME in result.stdout:
            queues = subprocess.run(
                [*inspect, "active_queues", "--timeout=2"], cwd=SERVICE,
                env=env, text=True, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, timeout=10,
            )
            if queues.returncode == 0 and QUEUE_NAME in queues.stdout:
                return
        time.sleep(1)
    raise RuntimeError("Standalone worker did not register the task and queue.")


def check_response(response, status):
    if response.status_code != status:
        raise AssertionError(
            f"{response.request.method} {response.request.url}: "
            f"expected {status}, got {response.status_code}: {response.text[:1000]}"
        )
    return response.json()


def exercise_flow(base_url, backend_env):
    import httpx

    os.environ.update(backend_env)
    sys.path.insert(0, str(BACKEND))
    import django

    django.setup()
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken
    from apps.courses.models import Course
    from apps.documents.models import Document, Job
    from apps.knowledge.models import Chunk
    from apps.knowledge import query_embeddings, retrieval

    query_embeddings.genai.Client = FakeGeminiClient
    user = get_user_model().objects.create_user(email="live-smoke@example.test")
    course = Course.objects.create(owner=user, name="Live processing smoke")
    token = str(AccessToken.for_user(user))
    with httpx.Client(
        base_url=base_url, headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    ) as client:
        upload = check_response(
            client.post(
                f"/api/v1/courses/{course.pk}/documents/",
                files={"file": ("live-lecture.pdf", make_pdf(), "application/pdf")},
            ),
            201,
        )
        assert upload["status"] == Document.Status.PENDING, upload
        document_id = upload["id"]
        print(f"[live] Upload returned PENDING for document {document_id}", flush=True)

        deadline = time.monotonic() + 90
        statuses = [upload["status"]]
        while time.monotonic() < deadline:
            detail = check_response(
                client.get(f"/api/v1/documents/{document_id}/"), 200,
            )
            if detail["status"] != statuses[-1]:
                statuses.append(detail["status"])
            if detail["status"] == Document.Status.READY:
                break
            if detail["status"] == Document.Status.FAILED:
                raise AssertionError(f"Worker reported FAILED: {detail}")
            time.sleep(0.5)
        else:
            raise AssertionError(f"Timed out waiting for READY: {statuses}")

        document = Document.objects.get(pk=document_id)
        job = Job.objects.get(document=document)
        chunks = list(Chunk.objects.filter(document=document).order_by("id"))
        assert document.status == Document.Status.READY
        assert job.status == Job.Status.SUCCEEDED
        assert document.page_count == 1
        assert chunks and PDF_TEXT in " ".join(chunk.content for chunk in chunks)
        assert all(chunk.embedding == VECTOR for chunk in chunks)
        print(f"[live] Worker callback stored {len(chunks)} chunk(s); status READY", flush=True)

        retrieved = retrieval.retrieve_chunks(user, document_id, "What are page faults?")
        assert retrieved and retrieved[0]["chunk_id"] == chunks[0].pk, retrieved
        assert PDF_TEXT in retrieved[0]["content"], retrieved

        answer = check_response(
            client.post(
                "/api/v1/rag/questions/",
                json={"question": "What are page faults?", "document_ids": [document_id]},
            ),
            200,
        )
        assert answer["status"] == "ANSWERED", answer
        assert answer["citations"] and answer["citations"][0]["chunk_id"] == chunks[0].pk
        assert answer["citations"][0]["excerpt"] in chunks[0].content

        notes = check_response(
            client.post(
                f"/api/v1/courses/{course.pk}/notes/",
                json={"document_ids": [document_id]},
            ),
            201,
        )
        assert notes["source_documents"] == [
            {"id": document_id, "name": "live-lecture.pdf"}
        ], notes
        assert notes["sections"][0]["points"] == [
            f"Fake point from {len(' '.join(chunk.content for chunk in chunks).split())} words."
        ], notes
        saved_notes = check_response(client.get(f"/api/v1/notes/{notes['id']}/"), 200)
        assert saved_notes["sections"] == notes["sections"]
        print("[live] Stored chunks retrieved and used by Pandu and notes", flush=True)
        return job.pk, len(chunks), statuses


def stop_process(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def print_log_tail(label, path):
    if path.exists():
        print(f"[live] {label} log tail:\n{path.read_text(errors='replace')[-5000:]}", file=sys.stderr)


def main():
    unique = uuid4().hex[:10]
    project = f"sf-processing-live-{unique}"
    app_db = f"studyforge_live_app_{unique}"
    processing_db = f"studyforge_live_processing_{unique}"
    admin = f"studyforge_live_admin_{unique}"
    admin_password = secrets.token_urlsafe(24)
    service_password = secrets.token_urlsafe(24)
    token = secrets.token_urlsafe(32)
    port = free_local_port()
    base_url = f"http://127.0.0.1:{port}"
    base_env = os.environ.copy()
    base_env.update({
        "POSTGRES_DB": app_db,
        "POSTGRES_USER": admin,
        "POSTGRES_PASSWORD": admin_password,
        "POSTGRES_PORT": "0",
        "REDIS_PORT": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
    })

    with tempfile.TemporaryDirectory(prefix="scrum101-live-") as temporary:
        temp = Path(temporary)
        empty_env = temp / "empty.env"
        empty_env.write_text("# Isolated from developer environment files.\n")
        compose = [
            "docker", "compose", "--env-file", str(empty_env),
            "--project-name", project, "-f", str(ROOT / "docker-compose.yml"),
        ]
        django_log = temp / "django.log"
        worker_log = temp / "worker.log"
        server = worker = None
        compose_started = False
        try:
            run([*compose, "config", "--quiet"], env=base_env)
            compose_started = True
            print(f"[live] Starting disposable Compose project {project}", flush=True)
            run(
                [*compose, "up", "-d", "--wait", "--wait-timeout", "120", "db", "redis"],
                env=base_env, timeout=180,
            )
            db_port = compose_port(compose, "db", 5432, base_env)
            redis_port = compose_port(compose, "redis", 6379, base_env)
            redis_url = f"redis://127.0.0.1:{redis_port}/0"

            backend_env = {
                **base_env,
                "POSTGRES_HOST": "127.0.0.1",
                "POSTGRES_PORT": db_port,
                "DATABASE_ENGINE": "postgresql",
                "MEDIA_ROOT": str(temp / "media"),
                "DJANGO_SECRET_KEY": secrets.token_urlsafe(32),
                "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1",
                "DJANGO_DEBUG": "0",
                "DJANGO_SETTINGS_MODULE": "config.settings",
                "CELERY_BROKER_URL": redis_url,
                "PROCESSING_SERVICE_TOKEN": token,
                "NOTES_LLM_BACKEND": "fake",
                "RAG_LLM_BACKEND": "fake",
                "GEMINI_API_KEY": "live-smoke-fake-key",
                "OPENAI_API_KEY": "",
                "EMBEDDING_MODEL": "gemini-embedding-2",
                "EMBEDDING_DIMENSION": "768",
            }
            service_env = {
                **{
                    key: value for key, value in base_env.items()
                    if key not in {
                        "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD",
                        "POSTGRES_PORT", "REDIS_PORT",
                        "PROCESSING_DB_ADMIN_USER",
                        "PROCESSING_DB_ADMIN_PASSWORD",
                        "PROCESSING_APPLICATION_DB",
                    }
                },
                "PROCESSING_DB_NAME": processing_db,
                "PROCESSING_DB_USER": processing_db,
                "PROCESSING_DB_PASSWORD": service_password,
                "PROCESSING_DB_HOST": "127.0.0.1",
                "PROCESSING_DB_PORT": db_port,
                "PROCESSING_SECRET_KEY": secrets.token_urlsafe(32),
                "PROCESSING_REDIS_URL": redis_url,
                "PROCESSING_DJANGO_API_URL": base_url,
                "PROCESSING_SERVICE_TOKEN": token,
                "DJANGO_SETTINGS_MODULE": "processing_service.settings",
                "GEMINI_API_KEY": "live-smoke-fake-key",
                "EMBEDDING_MODEL": "gemini-embedding-2",
                "EMBEDDING_DIMENSION": "768",
            }
            provision_env = {
                **service_env,
                "PROCESSING_DB_ADMIN_USER": admin,
                "PROCESSING_DB_ADMIN_PASSWORD": admin_password,
                "PROCESSING_APPLICATION_DB": app_db,
            }
            run(
                [sys.executable, "-B", str(SERVICE / "provision_database.py")],
                cwd=SERVICE, env=provision_env,
            )
            run(
                [sys.executable, "-B", str(BACKEND / "manage.py"), "migrate", "--noinput"],
                cwd=BACKEND, env=backend_env,
            )
            run(
                [sys.executable, "-B", str(SERVICE / "manage.py"), "migrate", "--noinput"],
                cwd=SERVICE, env=service_env,
            )

            with django_log.open("w", encoding="utf-8") as django_output, worker_log.open(
                "w", encoding="utf-8"
            ) as worker_output:
                server = subprocess.Popen(
                    [sys.executable, "-B", str(__file__), "--django-server", str(port)],
                    cwd=ROOT, env=backend_env, stdout=django_output,
                    stderr=subprocess.STDOUT,
                )
                wait_for_http(base_url, server)
                worker = subprocess.Popen(
                    [sys.executable, "-B", str(__file__), "--worker"],
                    cwd=ROOT, env=service_env, stdout=worker_output,
                    stderr=subprocess.STDOUT,
                )
                wait_for_worker(worker, service_env)
                job_id, chunk_count, statuses = exercise_flow(base_url, backend_env)

            server_output = django_log.read_text(errors="replace")
            worker_output = worker_log.read_text(errors="replace")
            assert f"GET /internal/v1/jobs/{job_id}/document/" in server_output
            assert f"POST /internal/v1/jobs/{job_id}/result/" in server_output
            assert TASK_NAME in worker_output
            print(
                f"[live] PASS: {statuses}, {chunk_count} persisted chunk(s), "
                "real Redis worker, source GET, and callback POST",
                flush=True,
            )
        except Exception:
            print_log_tail("Django", django_log)
            print_log_tail("worker", worker_log)
            raise
        finally:
            stop_process(worker)
            stop_process(server)
            if compose_started:
                cleanup = subprocess.run(
                    [*compose, "down", "--volumes", "--remove-orphans"],
                    cwd=ROOT, env=base_env, text=True, stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, timeout=90,
                )
                if cleanup.returncode:
                    print(f"[live] Compose cleanup failed:\n{cleanup.stdout}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--django-server":
        django_server(int(sys.argv[2]))
    elif sys.argv[1:] == ["--worker"]:
        processing_worker()
    elif len(sys.argv) == 1:
        main()
    else:
        raise SystemExit("Usage: python scripts/check_processing_live.py")
