"""Opt-in live document-processing smoke test.

Run with a Python environment containing backend and document-processing
requirements, plus Docker Compose:

    python scripts/check_processing_live.py [--storage {filesystem,s3}]
    python scripts/check_processing_live.py --storage oci --oci-env-file <path>

This creates a disposable Compose project, two databases, a real Django HTTP
server, and a standalone Celery worker. Only external AI provider functions
are replaced in the child processes. It is deliberately outside pytest and
scripts/check.py.

With --storage s3, a disposable SeaweedFS container stores the sources. Django
uses a read/write identity, the worker a separate read-only identity, and the
worker reads through the authenticated object locator (production mode). The
run also restarts storage and the worker, then deletes a document.

With --storage oci, the same checks run against a real Oracle Object Storage
bucket using the Django and worker customer secret keys from the credentials
file described in scripts/check_oci_storage.py (never printed). PostgreSQL
and Redis stay local and disposable. The storage restart is skipped (the
worker is still replaced), and every object this run created is deleted from
the shared bucket afterwards.
"""

from __future__ import annotations

from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import re
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
RESTART_PDF_TEXT = "StudyForge live processing lecture after a storage restart"
VECTOR = [0.25] * 768
# Pinned by digest so the disposable object store cannot change between runs.
SEAWEEDFS_IMAGE = (
    "chrislusf/seaweedfs@sha256:"
    "ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0"
)
S3_BUCKET = "studyforge-live-documents"
S3_REGION = "us-east-1"
# Only names this harness or Django's upload service generate (uuid4 hex).
RUN_OBJECT_KEY = re.compile(
    r"documents/\d{4}/\d{2}/[0-9a-f]{32}\.pdf|documents/live-worker-write-[0-9a-f]{32}\.pdf"
)
# Tolerance between the local clock and the bucket's LastModified time.
CLOCK_SKEW_SECONDS = 300


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


def make_pdf(text=PDF_TEXT):
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
        f"BT /F1 12 Tf 10 100 Td ({text}) Tj ET".encode("ascii")
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
        statuses = wait_until_ready(client, upload)

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
        word_count = len(" ".join(chunk.content for chunk in chunks).split())
        assert notes["sections"][0]["points"] == [
            f"Fake point {number} from {word_count} words." for number in (1, 2)
        ], notes
        saved_notes = check_response(client.get(f"/api/v1/notes/{notes['id']}/"), 200)
        assert saved_notes["sections"] == notes["sections"]
        print("[live] Stored chunks retrieved and used by Pandu and notes", flush=True)
        return SimpleNamespace(
            job_id=job.pk, chunk_count=len(chunks), statuses=statuses,
            document_id=document_id, upload=upload, course_id=course.pk, token=token,
        )


def wait_until_ready(client, upload, deadline_seconds=90):
    """Poll the public detail API until the worker callback marks READY."""
    deadline = time.monotonic() + deadline_seconds
    statuses = [upload["status"]]
    while time.monotonic() < deadline:
        detail = check_response(
            client.get(f"/api/v1/documents/{upload['id']}/"), 200,
        )
        if detail["status"] != statuses[-1]:
            statuses.append(detail["status"])
        if detail["status"] == "READY":
            return statuses
        if detail["status"] == "FAILED":
            raise AssertionError(f"Worker reported FAILED: {detail}")
        time.sleep(0.5)
    raise AssertionError(f"Timed out waiting for READY: {statuses}")


def s3_client(store, credentials):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3", endpoint_url=store.endpoint, region_name=store.region,
        aws_access_key_id=credentials[0], aws_secret_access_key=credentials[1],
        config=Config(
            connect_timeout=5, read_timeout=15, retries={"max_attempts": 1},
            s3={"addressing_style": "path"},
        ),
    )


def load_oci_store(env_file):
    """Use the real OCI bucket and the two customer secret keys from the file."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from check_oci_storage import ConfigError, load_env_file

    try:
        values = load_env_file(Path(env_file))
    except ConfigError as exc:
        raise SystemExit(f"[live] OCI configuration: {exc}") from None
    return SimpleNamespace(
        name=None, local=False,
        endpoint=values["SCRUM133_OCI_ENDPOINT_URL"],
        bucket=values["SCRUM133_OCI_BUCKET"],
        region=values["SCRUM133_OCI_REGION"],
        django_key=(values["SCRUM133_OCI_DJANGO_ACCESS_KEY_ID"], values["SCRUM133_OCI_DJANGO_SECRET_ACCESS_KEY"]),
        worker_key=(values["SCRUM133_OCI_WORKER_ACCESS_KEY_ID"], values["SCRUM133_OCI_WORKER_SECRET_ACCESS_KEY"]),
        created_keys=set(),
        run_started=time.time(),
    )


def cleanup_remote_objects(store):
    """Delete only objects this run created in the shared bucket.

    A key is deleted only if it was tracked by this run or listed in this
    run's fresh disposable database, matches the random-UUID names Django and
    this harness generate, and was last modified after the run started.
    The bucket is never listed.
    """
    from botocore.exceptions import ClientError

    keys = set(store.created_keys)
    try:
        # Rows of this run's disposable database name every uploaded source.
        from apps.documents.models import Document

        keys.update(name for name in Document.objects.values_list("file", flat=True) if name)
    except Exception:  # Django was never set up, so nothing was uploaded.
        pass
    client = s3_client(store, store.django_key)
    remaining, skipped = [], []
    for key in sorted(keys):
        if not RUN_OBJECT_KEY.fullmatch(key):
            skipped.append(key)
            continue
        try:
            head = client.head_object(Bucket=store.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                remaining.append(key)
            continue  # Already gone (or never created, e.g. a denied worker write).
        if head["LastModified"].timestamp() < store.run_started - CLOCK_SKEW_SECONDS:
            skipped.append(key)  # Older than this run: not ours, never delete it.
            continue
        try:
            client.delete_object(Bucket=store.bucket, Key=key)
            client.head_object(Bucket=store.bucket, Key=key)
            remaining.append(key)
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                remaining.append(key)
    if skipped:
        print(f"[live] OCI cleanup skipped {len(skipped)} key(s) not created by this run: {skipped}", file=sys.stderr)
    if remaining:
        print(f"[live] OCI cleanup left {len(remaining)} object(s): {remaining}", file=sys.stderr)
    if not skipped and not remaining:
        print(f"[live] OCI cleanup: {len(keys)} test object key(s) checked, none remain", flush=True)


def start_object_store(name, volume, temp):
    """Run SeaweedFS with separate Django read/write and worker read-only keys."""
    django_key = (f"django{uuid4().hex[:14]}", secrets.token_urlsafe(30))
    worker_key = (f"worker{uuid4().hex[:14]}", secrets.token_urlsafe(30))
    config = temp / "s3-identities.json"
    config.write_text(json.dumps({"identities": [
        {
            "name": "studyforge-django",
            "credentials": [{"accessKey": django_key[0], "secretKey": django_key[1]}],
            "actions": [f"{action}:{S3_BUCKET}" for action in ("Read", "Write", "List")],
        },
        {
            "name": "studyforge-worker",
            "credentials": [{"accessKey": worker_key[0], "secretKey": worker_key[1]}],
            "actions": [f"Read:{S3_BUCKET}"],
        },
    ]}))
    port = free_local_port()
    # A fixed host port keeps the endpoint stable across the restart check.
    run([
        "docker", "run", "--detach", "--pull", "never", "--name", name,
        "--publish", f"127.0.0.1:{port}:8333",
        "--mount", f"type=volume,source={volume},target=/data",
        "--mount", f"type=bind,source={config},target=/etc/studyforge/s3.json,readonly",
        SEAWEEDFS_IMAGE, "mini", "-dir=/data",
        "-s3.config=/etc/studyforge/s3.json", f"-bucket={S3_BUCKET}",
    ])
    store = SimpleNamespace(
        name=name, local=True, endpoint=f"http://127.0.0.1:{port}",
        bucket=S3_BUCKET, region=S3_REGION,
        django_key=django_key, worker_key=worker_key, created_keys=set(),
    )
    wait_for_bucket(store)
    return store


def wait_for_bucket(store, deadline_seconds=60):
    from botocore.exceptions import BotoCoreError, ClientError

    client = s3_client(store, store.django_key)
    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        try:
            client.head_bucket(Bucket=store.bucket)
            return
        except (BotoCoreError, ClientError):
            time.sleep(1)
    raise RuntimeError("Disposable object store did not become ready.")


def storage_env(store):
    # Only the local SeaweedFS store may use HTTP; an empty value also stops
    # backend/.env from supplying one (load_dotenv never overrides).
    allow_http = "1" if store.local else ""
    backend = {
        "DOCUMENT_STORAGE_BACKEND": "s3",
        "DOCUMENT_STORAGE_BUCKET": store.bucket,
        "DOCUMENT_STORAGE_REGION": store.region,
        "DOCUMENT_STORAGE_ENDPOINT_URL": store.endpoint,
        "DOCUMENT_STORAGE_ACCESS_KEY_ID": store.django_key[0],
        "DOCUMENT_STORAGE_SECRET_ACCESS_KEY": store.django_key[1],
        "DOCUMENT_STORAGE_ALLOW_HTTP": allow_http,
        "DOCUMENT_STORAGE_SESSION_TOKEN": "",
        "DOCUMENT_STORAGE_CA_BUNDLE": "",
    }
    worker = {
        "PROCESSING_SOURCE_MODE": "s3",
        "PROCESSING_STORAGE_BUCKET": store.bucket,
        "PROCESSING_STORAGE_REGION": store.region,
        "PROCESSING_STORAGE_ENDPOINT_URL": store.endpoint,
        "PROCESSING_STORAGE_ACCESS_KEY_ID": store.worker_key[0],
        "PROCESSING_STORAGE_SECRET_ACCESS_KEY": store.worker_key[1],
        "PROCESSING_STORAGE_ALLOW_HTTP": allow_http,
    }
    return backend, worker


def check_backend_ready(base_url):
    import httpx

    response = httpx.get(f"{base_url}/api/v1/ready/", timeout=10)
    body = check_response(response, 200)
    assert body["dependencies"]["storage"] == "ok", body
    print("[live] Django readiness reports object storage ok", flush=True)


def check_worker_ready(env):
    """Run the worker's own readiness probe with its read-only identity."""
    probe = (
        "import django; django.setup()\n"
        "from django.test import RequestFactory\n"
        "from processing_service.health import ready\n"
        "response = ready(RequestFactory().get('/ready/'))\n"
        "print(response.content.decode())\n"
        "raise SystemExit(response.status_code != 200)\n"
    )
    output = run([sys.executable, "-B", "-c", probe], cwd=SERVICE, env=env)
    assert '"storage": "ok"' in output, output
    print("[live] Worker readiness reports database, Redis and storage ok", flush=True)


def object_sha256(client, store, key):
    body = client.get_object(Bucket=store.bucket, Key=key)["Body"]
    try:
        return hashlib.sha256(body.read()).hexdigest()
    finally:
        body.close()


def assert_denied(label, operation):
    """SeaweedFS answers 403 AccessDenied; OCI hides denied writes as 404 NoSuchBucket.

    Callers also re-check the object afterwards, so a 404 cannot hide a write.
    """
    from botocore.exceptions import ClientError

    try:
        operation()
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        assert status in {403, 404}, exc.response.get("Error")
        return
    raise AssertionError(f"Worker identity was allowed to {label}.")


def verify_object_storage(flow, store, media_root, django_log, base_url):
    """Prove the source lives only in the bucket and the worker used the locator."""
    import httpx
    from apps.documents.models import Document

    from botocore.exceptions import ClientError

    document = Document.objects.get(pk=flow.document_id)
    key = document.file.name
    store.created_keys.add(key)
    assert key.startswith("documents/") and key.endswith(".pdf"), key
    django_client = s3_client(store, store.django_key)
    worker_client = s3_client(store, store.worker_key)
    assert object_sha256(django_client, store, key) == document.sha256
    assert object_sha256(worker_client, store, key) == document.sha256
    worker_write_key = f"documents/live-worker-write-{uuid4().hex}.pdf"
    store.created_keys.add(worker_write_key)
    assert_denied("upload", lambda: worker_client.put_object(
        Bucket=store.bucket, Key=worker_write_key, Body=b"%PDF"))
    assert_denied("overwrite", lambda: worker_client.put_object(
        Bucket=store.bucket, Key=key, Body=b"%PDF"))
    assert_denied("delete", lambda: worker_client.delete_object(Bucket=store.bucket, Key=key))
    assert object_sha256(django_client, store, key) == document.sha256
    try:
        django_client.head_object(Bucket=store.bucket, Key=worker_write_key)
    except ClientError as exc:
        assert exc.response["ResponseMetadata"]["HTTPStatusCode"] == 404, exc.response.get("Error")
    else:
        raise AssertionError("Worker identity created an object.")
    stored_files = [path for path in media_root.rglob("*") if path.is_file()] if media_root.exists() else []
    assert not stored_files, stored_files
    detail = check_response(httpx.get(
        f"{base_url}/api/v1/documents/{flow.document_id}/",
        headers={"Authorization": f"Bearer {flow.token}"}, timeout=20,
    ), 200)
    private_values = (key, store.endpoint, store.bucket, *store.django_key, *store.worker_key)
    for label, body in (("upload", flow.upload), ("detail", detail)):
        exposed = json.dumps(body)
        leaked = [value for value in private_values if value in exposed]
        assert not leaked, f"{label} response exposes storage information"

    log = django_log.read_text(errors="replace")
    assert f"GET /internal/v1/jobs/{flow.job_id}/object/" in log
    assert f"GET /internal/v1/jobs/{flow.job_id}/document/" not in log
    print(
        "[live] Source stored only in the bucket; worker read it through the "
        "locator with a read-only identity (upload/delete denied)",
        flush=True,
    )
    return key


def verify_restart(flow, store, first_key, base_url, start_worker, django_log):
    """Restart storage and the worker; old sources stay readable, new jobs run."""
    import httpx
    from apps.documents.models import Document, Job

    if store.local:
        # A managed bucket cannot be restarted; only the local store is.
        run(["docker", "stop", store.name])
        run(["docker", "start", store.name])
    wait_for_bucket(store)
    first = Document.objects.get(pk=flow.document_id)
    assert first.file.name == first_key
    django_client = s3_client(store, store.django_key)
    assert object_sha256(django_client, store, first_key) == first.sha256
    start_worker()

    with httpx.Client(
        base_url=base_url, headers={"Authorization": f"Bearer {flow.token}"},
        timeout=20,
    ) as client:
        source = client.get(f"/api/v1/documents/{flow.document_id}/file/")
        assert source.status_code == 200, source.status_code
        assert hashlib.sha256(source.content).hexdigest() == first.sha256
        upload = check_response(
            client.post(
                f"/api/v1/courses/{flow.course_id}/documents/",
                files={"file": ("after-restart.pdf", make_pdf(RESTART_PDF_TEXT), "application/pdf")},
            ),
            201,
        )
        statuses = wait_until_ready(client, upload)
    second = Document.objects.get(pk=upload["id"])
    store.created_keys.add(second.file.name)
    second_job = Job.objects.get(document=second)
    assert second_job.status == Job.Status.SUCCEEDED
    assert RESTART_PDF_TEXT in " ".join(second.chunks.values_list("content", flat=True))
    assert object_sha256(django_client, store, second.file.name) == second.sha256
    assert f"GET /internal/v1/jobs/{second_job.pk}/object/" in django_log.read_text(errors="replace")
    restarted = "storage and worker restart" if store.local else "worker restart"
    print(
        f"[live] After {restarted}: original source intact, new upload {statuses}",
        flush=True,
    )
    return second


def verify_deletion(flow, store, first_key, second, base_url):
    """Deleting one material removes only its object from the bucket."""
    import httpx
    from botocore.exceptions import ClientError
    from apps.documents.models import Document

    with httpx.Client(
        base_url=base_url, headers={"Authorization": f"Bearer {flow.token}"},
        timeout=20,
    ) as client:
        response = client.delete(f"/api/v1/documents/{flow.document_id}/")
        assert response.status_code == 204, response.status_code
        assert client.get(f"/api/v1/documents/{flow.document_id}/").status_code == 404
    assert not Document.objects.filter(pk=flow.document_id).exists()
    django_client = s3_client(store, store.django_key)
    try:
        django_client.head_object(Bucket=store.bucket, Key=first_key)
    except ClientError as exc:
        assert exc.response["Error"]["Code"] in {"404", "NoSuchKey", "NotFound"}, exc.response
    else:
        raise AssertionError("Deleted material's object is still in the bucket.")
    assert object_sha256(django_client, store, second.file.name) == second.sha256
    print("[live] Deleting a material removed only its object", flush=True)


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


def main(storage="filesystem", oci_env_file=None):
    # Fail on a bad credentials file before starting any container.
    remote_store = load_oci_store(oci_env_file) if storage == "oci" else None
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
    # Inherited storage settings must never point a run at other storage.
    base_env = {
        key: value for key, value in os.environ.items()
        if not key.startswith(("DOCUMENT_STORAGE_", "PROCESSING_STORAGE_", "AWS_", "SCRUM133_OCI_"))
    }
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
        restart_worker_log = temp / "worker-restart.log"
        media_root = temp / "media"
        server = worker = store = None
        compose_started = store_started = False
        store_name = f"{project}-s3"
        store_volume = f"{project}-s3-data"
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
            if storage == "s3":
                store_started = True
                print(f"[live] Starting disposable object store {store_name}", flush=True)
                store = start_object_store(store_name, store_volume, temp)
            elif remote_store is not None:
                store = remote_store
                print(
                    f"[live] Using OCI bucket {store.bucket} in {store.region} "
                    "with separate Django and worker keys",
                    flush=True,
                )

            backend_env = {
                **base_env,
                "POSTGRES_HOST": "127.0.0.1",
                "POSTGRES_PORT": db_port,
                "DATABASE_ENGINE": "postgresql",
                "MEDIA_ROOT": str(media_root),
                "DOCUMENT_STORAGE_BACKEND": "filesystem",
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
                "PROCESSING_SOURCE_MODE": "django",
                "DJANGO_SETTINGS_MODULE": "processing_service.settings",
                "GEMINI_API_KEY": "live-smoke-fake-key",
                "EMBEDDING_MODEL": "gemini-embedding-2",
                "EMBEDDING_DIMENSION": "768",
            }
            if store is not None:
                backend_storage, worker_storage = storage_env(store)
                backend_env.update(backend_storage)
                service_env.update(worker_storage)
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

            with ExitStack() as logs:
                django_output = logs.enter_context(django_log.open("w", encoding="utf-8"))
                server = subprocess.Popen(
                    [sys.executable, "-B", str(__file__), "--django-server", str(port)],
                    cwd=ROOT, env=backend_env, stdout=django_output,
                    stderr=subprocess.STDOUT,
                )
                wait_for_http(base_url, server)
                if store is not None:
                    check_backend_ready(base_url)
                    check_worker_ready(service_env)

                def start_worker(log_path):
                    nonlocal worker
                    output = logs.enter_context(log_path.open("w", encoding="utf-8"))
                    worker = subprocess.Popen(
                        [sys.executable, "-B", str(__file__), "--worker"],
                        cwd=ROOT, env=service_env, stdout=output,
                        stderr=subprocess.STDOUT,
                    )
                    wait_for_worker(worker, service_env)

                start_worker(worker_log)
                flow = exercise_flow(base_url, backend_env)
                if store is not None:
                    first_key = verify_object_storage(flow, store, media_root, django_log, base_url)
                    stop_process(worker)
                    second = verify_restart(
                        flow, store, first_key, base_url,
                        lambda: start_worker(restart_worker_log), django_log,
                    )
                    verify_deletion(flow, store, first_key, second, base_url)

            server_output = django_log.read_text(errors="replace")
            worker_output = worker_log.read_text(errors="replace")
            source_route = "object" if store is not None else "document"
            assert f"GET /internal/v1/jobs/{flow.job_id}/{source_route}/" in server_output
            assert f"POST /internal/v1/jobs/{flow.job_id}/result/" in server_output
            assert TASK_NAME in worker_output
            if store is not None:
                print(
                    f"[live] PASS ({storage}): {flow.statuses}, {flow.chunk_count} persisted "
                    "chunk(s), Django S3 upload, real Redis worker, object locator, "
                    "read-only worker GetObject, callback POST, restart and deletion",
                    flush=True,
                )
            else:
                print(
                    f"[live] PASS: {flow.statuses}, {flow.chunk_count} persisted chunk(s), "
                    "real Redis worker, source GET, and callback POST",
                    flush=True,
                )
        except Exception:
            print_log_tail("Django", django_log)
            print_log_tail("worker", worker_log)
            print_log_tail("restarted worker", restart_worker_log)
            raise
        finally:
            stop_process(worker)
            stop_process(server)
            if remote_store is not None:
                # Before Compose down: the disposable database lists the uploads.
                try:
                    cleanup_remote_objects(remote_store)
                except Exception as exc:
                    print(f"[live] OCI cleanup failed: {type(exc).__name__}", file=sys.stderr)
            if store_started:
                # Remove only this run's uniquely named container and volume,
                # skipping either one if startup failed before creating it.
                for kind, name, command in (
                    ("container", store_name, ["docker", "rm", "--force", store_name]),
                    ("volume", store_volume, ["docker", "volume", "rm", store_volume]),
                ):
                    exists = subprocess.run(
                        ["docker", kind, "inspect", name], stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL, timeout=30,
                    )
                    if exists.returncode:
                        continue
                    removed = subprocess.run(
                        command, text=True, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, timeout=90,
                    )
                    if removed.returncode:
                        print(f"[live] Object store cleanup failed:\n{removed.stdout}", file=sys.stderr)
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
    elif len(sys.argv) == 3 and sys.argv[1] == "--storage" and sys.argv[2] in {"filesystem", "s3"}:
        main(sys.argv[2])
    elif len(sys.argv) == 5 and sys.argv[1:3] == ["--storage", "oci"] and sys.argv[3] == "--oci-env-file":
        main("oci", oci_env_file=sys.argv[4])
    else:
        raise SystemExit(
            "Usage: python scripts/check_processing_live.py [--storage {filesystem,s3}]\n"
            "       python scripts/check_processing_live.py --storage oci --oci-env-file <path>"
        )
