# Backend Oracle deployment (SCRUM-125)

**Ticket:** Deploy backend, Postgres with pgvector, and Redis to production  
**Parent:** SCRUM-93 Project Setup  
**Target:** Oracle Cloud Infrastructure (OCI)  
**Region:** `us-phoenix-1` (US West / Phoenix)  
**Status:** Done (manual cutover verified) — auto-deploy deferred until after frontend  

**Production API URL:** `https://studyforge-rodians.duckdns.org`  
**Health check:** `GET /api/v1/health/` → `{"status": "ok"}`

## Goal

Run the Django backend with production Postgres (pgvector) and Redis so the
API works outside local development.

## Target architecture

One Always Free–friendly Compute VM in a public subnet:

```text
Internet (HTTPS :443)
  → Nginx (+ Let's Encrypt)
    → Gunicorn → Django (127.0.0.1:8000)
      → Postgres 16 + pgvector   [Docker Compose, private]
      → Redis 7                  [Docker Compose, private]
         ↑
      Django publishes document jobs to Redis for the standalone processing service
```

**Why this shape**

- Matches local `docker-compose.yml` (`pgvector/pgvector:pg16`, `redis:7-alpine`).
- Avoids Oracle Autonomous Database (not Postgres/pgvector).
- Keeps DB and Redis off the public internet.
- Docker volume `postgres_data` keeps data across app redeploys.

## Acceptance criteria (from ticket)

- [x] Backend API reachable via HTTPS at a production URL
- [x] Migrations run; pgvector retrieval works in production
- [x] Background tasks processed through production Redis at the SCRUM-125 cutover (historical backend worker, retired by SCRUM-101)
- [x] Data persists across backend redeployments (Gunicorn restart; DB volume kept)
- [x] No secrets committed to the repository

## Production settings (env-driven) — done in code

`backend/config/settings.py` reads production knobs from the environment.
Local defaults stay developer-friendly when vars are unset.

| Concern | Env var | Local default | Production |
|---------|---------|---------------|------------|
| `SECRET_KEY` | `DJANGO_SECRET_KEY` | insecure dev string | strong random secret |
| `DEBUG` | `DJANGO_DEBUG` | on (`1`) | `0` |
| `ALLOWED_HOSTS` | `DJANGO_ALLOWED_HOSTS` | localhost list | public IP + DuckDNS host (CSV) |
| CORS | `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | real frontend origin(s) |
| CSRF | `CSRF_TRUSTED_ORIGINS` | `http://localhost:5173` | real frontend origin(s) |
| Secure cookies | (when `DEBUG` is off) | off | `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` + proxy SSL header |
| `STATIC_ROOT` | `STATIC_ROOT` (optional) | `backend/staticfiles` | same or custom path |
| Process server | — | `runserver` | Gunicorn (in `requirements.txt`) |

Also used: `POSTGRES_*`, `CELERY_BROKER_URL`, `GEMINI_API_KEY`,
`GOOGLE_OAUTH_CLIENT_ID`, `PROCESSING_SERVICE_TOKEN`, `MEDIA_ROOT`.

## Secrets: `/etc/studyforge.env` (on the VM only)

Production secrets and env live on the **OCI VM**, not in git and not in
`backend/.env` on a laptop.

| Item | Value |
|------|--------|
| **Host** | `studyforge-api` (OCI Compute) |
| **Path** | `/etc/studyforge.env` |
| **Permissions** | `600`, owned by `root` (read via `sudo`) |
| **Used by** | systemd `EnvironmentFile=` for Gunicorn; the standalone processing service has its own environment |

### How to access (SSH first)

From your laptop:

```bash
ssh -i ~/.ssh/studyforge-oci.key ubuntu@<PUBLIC_IP>
```

On the VM:

```bash
# view
sudo cat /etc/studyforge.env

# edit
sudo nano /etc/studyforge.env

# after changes, restart app processes
sudo systemctl restart studyforge-gunicorn
```

**Do not** commit this file, paste secret values into docs/chat, or copy it into
the repo. Laptop `backend/.env` is local-only and separate from production.

### Django admin (optional)

Superusers are created on the VM (not via secrets file):

```bash
cd ~/studyforge/backend
source .venv/bin/activate
set -a; source /etc/studyforge.env; set +a
python manage.py createsuperuser
```

Then open: `https://studyforge-rodians.duckdns.org/admin/`

## OCI resource checklist

| Resource | Planned name / notes | Status |
|----------|----------------------|--------|
| Tenancy | `dhitalaashish20` | Exists |
| Region | US West (Phoenix) | Selected |
| VCN | `studyforge-vcn` | Created |
| Public subnet security rules | Ingress TCP 22, 80, 443 | Done |
| Compute instance | `studyforge-api` (Ubuntu 22.04, A1.Flex, public IP) | Running |
| Shape preference | VM.Standard.A1.Flex (1 OCPU / 6 GB) | Done |
| Domain / HTTPS | DuckDNS `studyforge-rodians.duckdns.org` + Certbot | Done |
| Host firewall | iptables ACCEPT tcp 80/443 before REJECT; `netfilter-persistent save` | Done |

**Do not create** Autonomous Transaction Processing (ATP) for this ticket.

## Step-by-step (living runbook)

### 1. Networking

| Step | Action | Status |
|------|--------|--------|
| 1.1 | OCI Home → Set up a network with a wizard → **Create VCN with Internet Connectivity** | Done |
| 1.2 | Name VCN (e.g. `studyforge-vcn`); keep public + private subnet defaults | Done |
| 1.3 | On public subnet security list / NSG: allow TCP **22**, **80**, **443** from `0.0.0.0/0` (or tighter SSH source) | Done |
| 1.4 | Confirm **5432** and **6379** are **not** open to the internet | Done |

### 2. Compute VM

| Step | Action | Status |
|------|--------|--------|
| 2.1 | Create VM instance: Ubuntu 22.04, public subnet, assign public IP | Done |
| 2.2 | Upload / generate SSH keypair; store private key outside the repo | Done |
| 2.3 | Instance Running; note public IP | Done |
| 2.4 | `ssh -i <key> ubuntu@<PUBLIC_IP>` | Done |

### 3. Host packages + Docker

| Step | Action | Status |
|------|--------|--------|
| 3.1 | `sudo apt update && sudo apt upgrade -y` | Done |
| 3.2 | Install Docker (get.docker.com) and add `ubuntu` to `docker` group | Done |
| 3.3 | Install `git`, `nginx`, Certbot | Done |
| 3.4 | Confirm `docker` and `docker compose` work | Done |
| 3.5 | Open VM iptables for **80** and **443** (OCI images often REJECT other NEW traffic); persist with `netfilter-persistent save` | Done |

### 4. Postgres + Redis (Compose)

Use the repo Compose services only (`db`, `redis`). Init script enables
`vector` on first volume create: `infrastructure/postgres/init.sql`.

| Step | Action | Status |
|------|--------|--------|
| 4.1 | Clone repo (or sync deploy files) onto the VM | Done |
| 4.2 | Create server Compose `.env` with strong `POSTGRES_PASSWORD` (not committed) | Done |
| 4.3 | `docker compose up -d` | Done |
| 4.4 | Verify: `pg_isready` / `SELECT` on `vector` extension | Done (`vector` 0.8.7) |
| 4.5 | Verify: `redis-cli ping` → `PONG` | Done |

### 5. Django + Gunicorn

| Step | Action | Status |
|------|--------|--------|
| 5.1 | Land production settings changes on the deploy branch | Done |
| 5.2 | venv + `pip install -r requirements.txt` (includes Gunicorn and Celery's Redis publisher dependencies) | Done |
| 5.3 | Env file on VM (`/etc/studyforge.env`, mode `600`) — no secrets in git | Done |
| 5.4 | `python manage.py migrate` | Done |
| 5.5 | `python manage.py collectstatic --noinput` | Done |
| 5.6 | systemd: `studyforge-gunicorn` on `127.0.0.1:8000` | Done |
| 5.7 | The former backend Celery worker is retired by SCRUM-101; Django only publishes to the standalone worker's queue. | Current architecture |

### 6. HTTPS reverse proxy

| Step | Action | Status |
|------|--------|--------|
| 6.1 | DuckDNS A record → VM public IP (`studyforge-rodians.duckdns.org`) | Done |
| 6.2 | Nginx proxy to Gunicorn | Done |
| 6.3 | Certbot / Let's Encrypt | Done |
| 6.4 | Smoke `curl -i https://studyforge-rodians.duckdns.org/api/v1/health/` | Done |

### 7. Acceptance verification

| Step | Action | Status |
|------|--------|--------|
| 7.1 | HTTPS API reachable | Done |
| 7.2 | Migrations + pgvector check | Done |
| 7.3 | Redis reachable for Django task publication; standalone worker deployment is verified separately | Redis verified; worker separate |
| 7.4 | Restart Gunicorn; confirm API + DB/pgvector still present | Done |
| 7.5 | Confirm no secrets in git for this work | Done |

## How deploy works today (manual)

Merging to Bitbucket (or GitHub) updates the **remote git history only**.
CI (`bitbucket-pipelines.yml` / `.github/workflows/ci.yml`) runs **tests** — it
does **not** SSH to Oracle or restart services.

```text
feature branch → PR → merge (e.g. development)
       ↓
  Bitbucket/GitHub: new commits + CI tests
       ↓
  OCI VM: unchanged until someone deploys
       ↓
  Human SSH → git pull → migrate → restart Gunicorn
       ↓
  Production API serves the new code
```

After code is on the branch the VM tracks, update production like this:

```bash
ssh -i ~/.ssh/studyforge-oci.key ubuntu@<PUBLIC_IP>
cd ~/studyforge
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt
set -a; source /etc/studyforge.env; set +a
python manage.py migrate --noinput
python manage.py collectstatic --noinput
sudo systemctl restart studyforge-gunicorn
curl -i https://studyforge-rodians.duckdns.org/api/v1/health/
```

When deploying SCRUM-101 to a VM that still has the former backend
`studyforge-celery` unit, retire it once with
`sudo systemctl disable --now studyforge-celery`. Deploy and verify the standalone
document-processing worker separately; restarting Gunicorn does not start it.

## Planned: Bitbucket auto-deploy (after frontend)

**Defer until the frontend is deployed** (e.g. Vercel) and CORS/CSRF origins are
set. Then automate the same steps via **Bitbucket Pipelines** (team source of
truth for merge), not by hand.

Intended shape:

```text
merge to deploy branch (main or development — configurable)
  → Bitbucket Pipeline: tests pass
  → deploy step SSHs into studyforge-api
  → runs pull / pip / migrate / collectstatic / restart
  → smoke health check
```

What we will need later:

| Piece | Role |
|-------|------|
| Deploy branch choice | Only that branch triggers deploy (`main` preferred; can switch) |
| `scripts/deploy-oci.sh` (or equivalent) | Same commands as the manual ritual |
| Bitbucket Repository variables / Secured variables | SSH private key, host, user — **never in git** |
| VM `authorized_keys` + limited sudo | Allow CI to restart Gunicorn only |
| Post-frontend CORS | Vercel origin already in `/etc/studyforge.env` before auto-deploy matters for browsers |

Until that pipeline exists, continue using the manual SSH flow above.

## Document-processing microservice (how it can be deployed)

SCRUM-125 deploys the **Django API + Compose Postgres/Redis**. Django publishes
document jobs to Redis but does not run a backend Celery worker. The
**document-processing** service is a **separate** Celery worker
(`services/document-processing/`) that consumes the `document-processing` queue,
calls back into Django, and needs `PROCESSING_SERVICE_TOKEN` + `GEMINI_API_KEY`.
It is **not** required for the SCRUM-125 HTTPS API acceptance checks.

| Approach | When / notes |
|----------|----------------|
| **Local kind (already documented)** | Phase 1: worker Pod in kind cluster `studyforge`; Django/Redis/Postgres stay on the host. See [kind-local-worker.md](../kind-local-worker.md) and `services/document-processing/kind-worker.yaml`. |
| **Same OCI VM (Compose or systemd)** | Build/run the processing image or venv on `studyforge-api`; point broker at local Redis; set Django base URL to `https://studyforge-rodians.duckdns.org` (or `http://127.0.0.1` for on-box callbacks); put tokens in VM env/secrets — **not** in git. Fits a small Always Free box if CPU/RAM allow. |
| **Separate Compute / K8s later** | Same image + env contract; worker reaches Django over HTTPS; Redis reachable privately; scale replicas independently. Overkill until the API+frontend path is stable. |

**Not done in SCRUM-125:** production deploy of the processing microservice. Track
as a follow-up after frontend (and preferably after Bitbucket auto-deploy for the
API is sketched). Keep `PROCESSING_SERVICE_TOKEN` aligned between Django
(`/etc/studyforge.env`) and the worker secret store.

## Follow-ups (after frontend)

| Item | Notes |
|------|--------|
| Frontend on Vercel | Set `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` in `/etc/studyforge.env` to the Vercel HTTPS origin; restart Gunicorn |
| Bitbucket auto-deploy | Pipeline SSH deploy of the manual steps; **after frontend**; branch configurable |
| Document-processing worker | Production path TBD (OCI VM vs K8s); local kind path already in `docs/kind-local-worker.md` |
| `packaging` | Explicit in `backend/requirements.txt` for the Django Celery publisher's Redis transport |

## Environment variable placeholders

Fill real values only on the VM in `/etc/studyforge.env` — not in this file.

```text
DJANGO_SECRET_KEY=<django-secret>
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=<public-ip>,studyforge-rodians.duckdns.org,127.0.0.1,localhost
POSTGRES_DB=studyforge
POSTGRES_USER=studyforge
POSTGRES_PASSWORD=<strong-password>
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CORS_ALLOWED_ORIGINS=https://<frontend-origin>
CSRF_TRUSTED_ORIGINS=https://<frontend-origin>
GEMINI_API_KEY=<optional-until-embeddings>
GOOGLE_OAUTH_CLIENT_ID=<optional-until-google-signin>
PROCESSING_SERVICE_TOKEN=<optional-until-worker>
```

## Smoke tests (from laptop)

```bash
curl -i https://studyforge-rodians.duckdns.org/api/v1/health/
# expect HTTP/1.1 200 and {"status": "ok"}
```

On the VM (optional):

```bash
sudo systemctl status studyforge-gunicorn nginx --no-pager
docker compose exec redis redis-cli ping
docker compose exec db psql -U studyforge -d studyforge -c \
  "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

Note: StudyForge uses `AUTH_USER_MODEL = users.User` — there is no `auth_user`
table; use `users_user` (or `\dt`) for row counts. Curl to bare `http://127.0.0.1`
may 404 after Certbot; use the DuckDNS Host header or the public HTTPS URL.

## Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-11-11 | Single OCI Compute VM + Docker Compose for Postgres/Redis | Matches local stack; Always Free–friendly; ATP is wrong database product |
| 2026-11-11 | Do not expose 5432/6379 publicly | Least privilege; app talks over localhost |
| 2026-11-11 | Keep living docs under `docs/deployment/` | Update as deploy proceeds |
| 2026-11-13 | Free hostname via DuckDNS + Certbot on Nginx | Oracle does not provide a free public API domain; Let's Encrypt needs a hostname |
| 2026-11-13 | Secrets only in `/etc/studyforge.env` on the VM | Never commit production secrets; systemd EnvironmentFile |
| 2026-11-13 | Bitbucket auto-deploy after frontend | Manual cutover proven; automate via Pipelines SSH once Vercel CORS is set |
| 2026-11-13 | Processing worker out of SCRUM-125 scope | Separate microservice; kind local path exists; OCI/K8s production later |

## Blockers / notes

| Date | Note |
|------|------|
| 2026-11-12 | OCI VM + Compose Postgres/pgvector + Redis verified; settings now env-driven |
| 2026-11-13 | Public HTTP blocked until iptables ACCEPT for 80/443 before REJECT; persist with netfilter-persistent |
| 2026-11-13 | Celery failed with `ModuleNotFoundError: packaging` until `pip install packaging`; pin in requirements.txt |
| 2026-11-13 | Brief 502 after `systemctl restart` Gunicorn is normal until workers listen again |

## Changelog

| Date | Change |
|------|--------|
| 2026-11-11 | Created `docs/deployment/` and this SCRUM-125 OCI runbook |
| 2026-11-12 | Env-driven DEBUG/SECRET_KEY/ALLOWED_HOSTS/CORS/CSRF/STATIC_ROOT/secure cookies; gunicorn dep |
| 2026-11-13 | Marked cutover done; DuckDNS HTTPS URL; `/etc/studyforge.env` access docs; iptables; Celery; packaging in requirements; manual vs Bitbucket auto-deploy; processing microservice deploy options |
| 2026-11-13 | Renamed runbook to `backend-oracle-deployment.md` | Clearer deploy-doc name; SCRUM-125 still in title |
