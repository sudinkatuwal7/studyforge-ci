# SCRUM-110 Phase 1: local kind worker

This deployment runs only the independent document-processing Celery worker in
the kind cluster named `studyforge`. Django, Redis, and PostgreSQL/pgvector stay
on the developer's Mac through the existing Docker Compose setup.

The worker uses the existing image, task, queue, and environment variable names:

- Image: `studyforge-document-processing:kind`, built from
  `services/document-processing/Dockerfile`.
- Command: `celery -A processing_service.celery:app worker --loglevel=INFO
  --queues=document-processing --hostname=processing-worker@%h`.
- Queue: `document-processing`.
- Django source and callback base URL: `http://host.docker.internal:8000`.
- Redis broker: `redis://host.docker.internal:6379/0`.

The worker does not expose a Kubernetes Service. It retrieves the private source
PDF from Django and sends the result callback to Django; Django remains the owner
of application PostgreSQL/pgvector persistence.

## Prerequisites

- Docker Desktop running Linux containers.
- `kind` and `kubectl` installed.
- The kind cluster is named `studyforge`.
- A valid Gemini API key.
- The Django process is configured with the same
  `PROCESSING_SERVICE_TOKEN` used below.

## Create the Kubernetes Secret

Do not place real tokens or API keys in `kind-worker.yaml`. Create the Secret
locally and use the same service token in the Django environment:

```bash
kubectl create secret generic studyforge-processing-secrets \
  --from-literal=PROCESSING_SECRET_KEY='local-processing-secret' \
  --from-literal=PROCESSING_DB_PASSWORD='processing_local_dev' \
  --from-literal=PROCESSING_SERVICE_TOKEN='replace-with-a-shared-local-token' \
  --from-literal=GEMINI_API_KEY="$GEMINI_API_KEY"
```

The worker settings require `PROCESSING_SECRET_KEY` and
`PROCESSING_DB_PASSWORD`; the source and callback clients require
`PROCESSING_SERVICE_TOKEN`; embeddings require `GEMINI_API_KEY`.

## Start the existing host dependencies

From the repository root, start the existing PostgreSQL and Redis services:

```bash
docker compose up -d db redis
```

Run Django on all host interfaces so a kind Pod can reach it through Docker
Desktop's host gateway:

```bash
cd backend
PROCESSING_SERVICE_TOKEN="$(kubectl get secret studyforge-processing-secrets \
  -o jsonpath='{.data.PROCESSING_SERVICE_TOKEN}' | base64 -D)" \
python manage.py runserver 0.0.0.0:8000
```

This retrieves the token from the existing Kubernetes Secret and passes it to
Django without printing the token value.

The backend already allows `host.docker.internal`. Keep the Compose host ports
available: Redis `6379`, PostgreSQL `5432`, and Django `8000`.

## Build and load the existing worker image

```bash
docker build -t studyforge-document-processing:kind \
  ./services/document-processing
kind load docker-image studyforge-document-processing:kind \
  --name studyforge
```

The manifest uses `imagePullPolicy: IfNotPresent`, so the loaded local image is
used instead of pulling from a registry.

## Deploy one worker replica

```bash
kubectl apply -f services/document-processing/kind-worker.yaml
kubectl rollout status deployment/processing-worker
kubectl get pods -l app=processing-worker
kubectl logs deployment/processing-worker
```

Confirm the worker is registered with Celery and subscribed to the required
queue. The command uses the same image and application configuration as the Pod:

```bash
kubectl exec deployment/processing-worker -- \
  celery -A processing_service.celery:app inspect registered
kubectl exec deployment/processing-worker -- \
  celery -A processing_service.celery:app inspect active_queues
```

The registered task must include
`processing_service.tasks.process_document_task`, and the active queue must
include `document-processing`.

## Scale from one to two replicas

Scaling is manual for Phase 1:

```bash
kubectl scale deployment/processing-worker --replicas=2
kubectl rollout status deployment/processing-worker
kubectl get pods -l app=processing-worker -o wide
```

Both Pods consume the same Redis queue. Each task is consumed by one available
worker; the document is not intentionally processed twice.

## Verify the real processing path

Use the existing authenticated upload API and upload a small valid PDF:

```text
POST http://127.0.0.1:8000/api/v1/courses/{course_id}/documents/
GET  http://127.0.0.1:8000/api/v1/documents/{document_id}/
```

Poll until the document reaches `READY`. Inspect both worker logs and Django's
database. A successful acceptance run must show:

```text
PENDING → PROCESSING → READY
```

and persisted chunks/embeddings in the existing PostgreSQL/pgvector database.

## Troubleshooting host connectivity

Test Django from a temporary Pod:

```bash
kubectl run django-connectivity-check --rm -it \
  --image=curlimages/curl --restart=Never -- \
  curl --silent --show-error --output /dev/null --write-out 'HTTP %{http_code}\n' \
  http://host.docker.internal:8000/
```

Any `HTTP <status>` response, including an application-level `4xx` or `5xx`,
proves that the Pod reached Django. A curl connection error such as
`Could not connect to server` or `Connection refused` means the Pod could not
establish a connection; check that Django is running on `0.0.0.0:8000` and that
the host gateway is reachable. This check intentionally uses the Django root
URL rather than assuming a dedicated health endpoint exists.

Test Redis from a temporary Pod:

```bash
kubectl run redis-connectivity-check --rm -it \
  --image=redis:7-alpine --restart=Never -- \
  redis-cli -h host.docker.internal ping
```

Both checks must succeed before uploading a document. Docker Desktop's
`host.docker.internal` behavior must be verified on the target Mac; kind's
containerized networking is not the same as native Linux networking.

## Cleanup

```bash
kubectl delete -f services/document-processing/kind-worker.yaml
kubectl delete secret studyforge-processing-secrets
kind delete cluster --name studyforge
```

This Phase 1 deployment does not add Django, PostgreSQL, Redis, a public worker
Service, ingress, Helm, autoscaling, or production storage.
