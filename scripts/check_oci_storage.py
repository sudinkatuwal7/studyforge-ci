"""Verify the SCRUM-133 Oracle Object Storage identities against a real bucket.

Usage (backend Python 3.12 venv, from the repository root):

    python scripts/check_oci_storage.py --oci-env-file <path outside the repo>

The env file holds KEY=VALUE lines for every name in REQUIRED_KEYS. Values are
handed only to child processes through their environment and are never
printed. The check uses the application's own storage clients:

* Django identity (backend ``default_storage``): HeadBucket, upload, read back
  with a matching SHA-256, delete.
* Worker identity (``processing_service.object_storage.client``): HeadBucket
  and GetObject with a matching SHA-256 are allowed; uploading a new key,
  overwriting the probe and deleting it are denied.
* No credentials: the probe object is not publicly readable.

It writes one uniquely named probe object under ``documents/`` and always
removes it, plus anything the worker should not have been able to create,
with the Django identity. No database, Redis or production setting is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
SERVICE = ROOT / "services" / "document-processing"
REQUIRED_KEYS = (
    "SCRUM133_OCI_BUCKET",
    "SCRUM133_OCI_REGION",
    "SCRUM133_OCI_ENDPOINT_URL",
    "SCRUM133_OCI_DJANGO_ACCESS_KEY_ID",
    "SCRUM133_OCI_DJANGO_SECRET_ACCESS_KEY",
    "SCRUM133_OCI_WORKER_ACCESS_KEY_ID",
    "SCRUM133_OCI_WORKER_SECRET_ACCESS_KEY",
)
# Inherited settings that could redirect a child to other storage or modes.
STRIPPED_PREFIXES = ("DOCUMENT_STORAGE_", "PROCESSING_STORAGE_", "AWS_", "SCRUM133_OCI_")
STRIPPED_NAMES = {
    "DJANGO_SETTINGS_MODULE",
    "STUDYFORGE_REQUIRE_SECURE_CONNECTIONS",
    "PROCESSING_REQUIRE_DIRECT_STORAGE",
    "PROCESSING_SOURCE_MODE",
}
DENIED_STATUSES = {403, 404}
CHILD_TIMEOUT_SECONDS = 90


class ConfigError(ValueError):
    pass


# --------------------------------------------------------------------------
# Parent: configuration, orchestration and reporting
# --------------------------------------------------------------------------


def load_env_file(path: Path) -> dict[str, str]:
    """Read KEY=VALUE lines; error messages name keys only, never values."""
    path = path.expanduser().resolve()
    if not path.is_file():
        raise ConfigError(f"{path} does not exist.")
    if ROOT == path or ROOT in path.parents:
        raise ConfigError("Keep the credentials file outside the repository.")
    values = {}
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, value = line.partition("=")
        if not separator:
            raise ConfigError(f"Line {number} is not KEY=VALUE.")
        values[name.strip()] = value.strip()
    missing = [name for name in REQUIRED_KEYS if not values.get(name)]
    if missing:
        raise ConfigError("Missing " + ", ".join(missing) + ".")
    endpoint = urlsplit(values["SCRUM133_OCI_ENDPOINT_URL"])
    if endpoint.scheme != "https" or not endpoint.netloc or endpoint.username or endpoint.password:
        raise ConfigError("SCRUM133_OCI_ENDPOINT_URL must be a plain https:// URL.")
    if values["SCRUM133_OCI_DJANGO_ACCESS_KEY_ID"] == values["SCRUM133_OCI_WORKER_ACCESS_KEY_ID"]:
        raise ConfigError("Django and worker must use different customer secret keys.")
    return values


def child_env(role: str, values: dict[str, str]) -> dict[str, str]:
    env = {
        name: value
        for name, value in os.environ.items()
        if not name.startswith(STRIPPED_PREFIXES) and name not in STRIPPED_NAMES
    }
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    bucket = values["SCRUM133_OCI_BUCKET"]
    region = values["SCRUM133_OCI_REGION"]
    endpoint = values["SCRUM133_OCI_ENDPOINT_URL"]
    if role == "worker":
        env.update({
            "DJANGO_SETTINGS_MODULE": "processing_service.settings",
            "PROCESSING_SOURCE_MODE": "s3",
            "PROCESSING_STORAGE_BUCKET": bucket,
            "PROCESSING_STORAGE_REGION": region,
            "PROCESSING_STORAGE_ENDPOINT_URL": endpoint,
            "PROCESSING_STORAGE_ACCESS_KEY_ID": values["SCRUM133_OCI_WORKER_ACCESS_KEY_ID"],
            "PROCESSING_STORAGE_SECRET_ACCESS_KEY": values["SCRUM133_OCI_WORKER_SECRET_ACCESS_KEY"],
            # Required by the worker settings module; no database is opened.
            "PROCESSING_SECRET_KEY": secrets.token_urlsafe(32),
            "PROCESSING_DB_PASSWORD": secrets.token_urlsafe(16),
        })
    else:
        env.update({
            "DJANGO_SETTINGS_MODULE": "config.settings",
            "DOCUMENT_STORAGE_BACKEND": "s3",
            "DOCUMENT_STORAGE_BUCKET": bucket,
            "DOCUMENT_STORAGE_REGION": region,
            "DOCUMENT_STORAGE_ENDPOINT_URL": endpoint,
            "DOCUMENT_STORAGE_ACCESS_KEY_ID": values["SCRUM133_OCI_DJANGO_ACCESS_KEY_ID"],
            "DOCUMENT_STORAGE_SECRET_ACCESS_KEY": values["SCRUM133_OCI_DJANGO_SECRET_ACCESS_KEY"],
            # Set empty so backend/.env cannot supply them (load_dotenv never overrides).
            "DOCUMENT_STORAGE_ALLOW_HTTP": "",
            "DOCUMENT_STORAGE_SESSION_TOKEN": "",
            "DOCUMENT_STORAGE_CA_BUNDLE": "",
        })
    return env


def run_child(role: str, values: dict[str, str], payload: dict) -> dict:
    """Run one identity's checks in its own Django settings process."""
    try:
        completed = subprocess.run(
            [sys.executable, "-B", str(Path(__file__).resolve()), "--child", role],
            cwd=SERVICE if role == "worker" else BACKEND,
            env=child_env(role, values),
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=CHILD_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {"checks": [[f"{role} process", False, "timed out"]]}
    lines = completed.stdout.strip().splitlines()
    try:
        return json.loads(lines[-1])
    except (IndexError, ValueError):
        last = (completed.stderr.strip().splitlines() or ["no output"])[-1]
        return {"checks": [[f"{role} process", False, last[:300]]]}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def check_anonymous(values: dict[str, str], key: str) -> list:
    """The private bucket must refuse an unsigned GET of the probe."""
    url = "/".join((
        values["SCRUM133_OCI_ENDPOINT_URL"].rstrip("/"),
        quote(values["SCRUM133_OCI_BUCKET"]),
        quote(key),
    ))
    label = "Unauthenticated GET of the probe refused"
    try:
        with build_opener(_NoRedirect()).open(Request(url, method="GET"), timeout=10) as response:
            status = response.status
    except HTTPError as exc:
        status = exc.code
    except (URLError, OSError) as exc:
        return [label, False, f"endpoint unreachable ({type(exc).__name__})"]
    return [label, status in {401, *DENIED_STATUSES}, f"HTTP {status}"]


def report(checks: list) -> bool:
    passed = True
    for label, ok, detail in checks:
        passed &= bool(ok)
        suffix = f" ({detail})" if detail else ""
        print(f"[oci] {'PASS' if ok else 'FAIL'} {label}{suffix}", flush=True)
    return passed


def make_probe() -> bytes:
    return b"%PDF-1.4\n% StudyForge SCRUM-133 OCI probe " + secrets.token_hex(16).encode() + b"\n%%EOF\n"


def parent(env_file: str) -> int:
    try:
        values = load_env_file(Path(env_file))
    except ConfigError as exc:
        print(f"[oci] FAIL configuration: {exc}", file=sys.stderr)
        return 2

    content = make_probe()
    key = f"documents/scrum133-probe-{uuid4().hex}.pdf"
    probe = {
        "bucket": values["SCRUM133_OCI_BUCKET"],
        "key": key,
        "worker_key": key.removesuffix(".pdf") + "-worker-write.pdf",
        "content_hex": content.hex(),
        "sha256": hashlib.sha256(content).hexdigest(),
        "names": [key],
    }
    print(f"[oci] Bucket {probe['bucket']} in {values['SCRUM133_OCI_REGION']}; probe {key}", flush=True)

    passed = True
    try:
        upload = run_child("django-upload", values, probe)
        passed &= report(upload["checks"])
        if upload.get("name"):
            probe["names"].append(upload["name"])
        if passed:
            passed &= report([check_anonymous(values, key)])
            passed &= report(run_child("worker", values, probe)["checks"])
            passed &= report(run_child("django-verify-delete", values, probe)["checks"])
    finally:
        cleanup = run_child("django-cleanup", values, probe)
        passed &= report(cleanup["checks"])
    print(f"[oci] {'ALL CHECKS PASSED' if passed else 'CHECKS FAILED'}", flush=True)
    return 0 if passed else 1


# --------------------------------------------------------------------------
# Children: run inside the backend or worker settings with one identity each
# --------------------------------------------------------------------------


def _error_detail(exc: Exception) -> str:
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        code = response.get("Error", {}).get("Code")
        if str(code) == str(status):
            # HEAD responses have no body; a bad key and a denied policy look alike.
            return f"HTTP {status} with no reason (check the access key and policy)"
        return f"HTTP {status} {code}"
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def django_upload(probe: dict, checks: list, result: dict) -> None:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    # Same call as backend/config/health.py readiness.
    default_storage.bucket.meta.client.head_bucket(Bucket=probe["bucket"])
    checks.append(["Django HeadBucket (readiness)", True, ""])
    content = bytes.fromhex(probe["content_hex"])
    name = default_storage.save(probe["key"], ContentFile(content))
    result["name"] = name
    checks.append(["Django upload through default_storage", name == probe["key"],
                   "" if name == probe["key"] else "storage changed the key"])
    with default_storage.open(name, "rb") as source:
        data = source.read()
    checks.append(["Django read back, SHA-256 matches", _sha256(data) == probe["sha256"], ""])


def worker(probe: dict, checks: list, result: dict) -> None:
    from botocore.exceptions import ClientError
    from processing_service.object_storage import client

    bucket, key = probe["bucket"], probe["key"]
    storage = client()
    # Same call as processing_service/health.py readiness.
    storage.head_bucket(Bucket=bucket)
    checks.append(["Worker HeadBucket (readiness)", True, ""])
    body = storage.get_object(Bucket=bucket, Key=key)["Body"]
    try:
        data = body.read()
    finally:
        body.close()
    checks.append(["Worker GetObject, SHA-256 matches", _sha256(data) == probe["sha256"], ""])

    attempts = (
        ("Worker upload of a new key denied",
         lambda: storage.put_object(Bucket=bucket, Key=probe["worker_key"], Body=b"%PDF-1.4\n")),
        ("Worker overwrite of the probe denied",
         lambda: storage.put_object(Bucket=bucket, Key=key, Body=b"%PDF-1.4\n")),
        ("Worker delete of the probe denied",
         lambda: storage.delete_object(Bucket=bucket, Key=key)),
    )
    for label, attempt in attempts:
        try:
            attempt()
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            checks.append([label, status in DENIED_STATUSES, _error_detail(exc)])
        else:
            checks.append([label, False, "operation was allowed"])


def django_verify_delete(probe: dict, checks: list, result: dict) -> None:
    from django.core.files.storage import default_storage

    with default_storage.open(probe["key"], "rb") as source:
        unchanged = _sha256(source.read()) == probe["sha256"]
    checks.append(["Probe unchanged after worker write/delete attempts", unchanged, ""])
    checks.append(["Worker-created key does not exist",
                   not default_storage.exists(probe["worker_key"]), ""])
    default_storage.delete(probe["key"])
    checks.append(["Django delete removes the probe", not default_storage.exists(probe["key"]), ""])


def django_cleanup(probe: dict, checks: list, result: dict) -> None:
    from django.core.files.storage import default_storage

    leftovers = []
    stem = probe["key"].removesuffix(".pdf")  # documents/scrum133-probe-<uuid of this run>
    for name in dict.fromkeys([*probe["names"], probe["worker_key"]]):
        if not name.startswith(stem):
            checks.append(["Cleanup skipped a key not created by this run", False, name])
            continue
        if default_storage.exists(name):
            default_storage.delete(name)
            leftovers.append(name)
    remaining = [name for name in leftovers if default_storage.exists(name)]
    detail = f"removed {len(leftovers)} leftover object(s)" if leftovers else ""
    checks.append(["Cleanup leaves no probe objects", not remaining, detail])


CHILD_ROLES = {
    "django-upload": django_upload,
    "worker": worker,
    "django-verify-delete": django_verify_delete,
    "django-cleanup": django_cleanup,
}


def child(role: str) -> int:
    probe = json.loads(sys.stdin.read())
    sys.path.insert(0, str(SERVICE if role == "worker" else BACKEND))
    import django

    django.setup()
    checks, result = [], {}
    try:
        CHILD_ROLES[role](probe, checks, result)
    except Exception as exc:  # Report the failing step without credentials.
        checks.append([f"{role} stopped", False, _error_detail(exc)])
    print(json.dumps({**result, "checks": checks}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--oci-env-file", help="KEY=VALUE credentials file outside the repository.")
    parser.add_argument("--child", choices=sorted(CHILD_ROLES), help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.child:
        return child(args.child)
    if not args.oci_env_file:
        parser.error("--oci-env-file is required.")
    return parent(args.oci_env_file)


if __name__ == "__main__":
    raise SystemExit(main())
