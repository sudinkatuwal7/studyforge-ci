#!/usr/bin/env bash
# Render the SCRUM-134 Redis ACL file with new random passwords.
#
# Usage: generate-redis-acl.sh OUT_DIR
# Writes OUT_DIR/redis-users.acl (SHA-256 hashes only) and
# OUT_DIR/redis-credentials.env (plaintext passwords, mode 0600). Move the
# credentials into the approved secret locations; never commit either file.
#
# Users (permissions verified with the pinned celery 5.6.3 / kombu 5.7.0 /
# redis 6.4.0; see docs/deployment/scrum-134-postgres-redis-network.md):
#   studyforge_ops     administration and backups only
#   studyforge_django  Gunicorn publisher, the VM's legacy Celery consumer and
#                      the password-reset cache
#   studyforge_worker  OKE worker: document-processing queue, events, pidbox
#   studyforge_scaler  KEDA: queue length only
set -euo pipefail

[[ $# -eq 1 ]] || { echo "Usage: $0 OUT_DIR" >&2; exit 2; }
out=$1
template="$(cd "$(dirname "$0")" && pwd)/redis-users.acl.template"
umask 077
mkdir -p "$out"
for file in redis-users.acl redis-credentials.env; do
  if [[ -e "$out/$file" ]]; then
    echo "Refusing to overwrite $out/$file." >&2
    exit 1
  fi
done

hash() { printf '%s' "$1" | openssl dgst -sha256 -r | cut -d' ' -f1; }
ops=$(openssl rand -hex 32)
django=$(openssl rand -hex 32)
worker=$(openssl rand -hex 32)
scaler=$(openssl rand -hex 32)

sed -e "s/@OPS_HASH@/$(hash "$ops")/" \
    -e "s/@DJANGO_HASH@/$(hash "$django")/" \
    -e "s/@WORKER_HASH@/$(hash "$worker")/" \
    -e "s/@SCALER_HASH@/$(hash "$scaler")/" \
    "$template" >"$out/redis-users.acl"
cat >"$out/redis-credentials.env" <<EOF
REDIS_OPS_PASSWORD=$ops
REDIS_DJANGO_PASSWORD=$django
REDIS_WORKER_PASSWORD=$worker
REDIS_SCALER_PASSWORD=$scaler
EOF
chmod 600 "$out/redis-users.acl" "$out/redis-credentials.env"
echo "Wrote $out/redis-users.acl and $out/redis-credentials.env."
