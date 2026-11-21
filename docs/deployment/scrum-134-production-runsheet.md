# SCRUM-134 production run-sheet: PostgreSQL/Redis TLS, auth and the private OKE path

**Status: DRAFT, not approved.** Do not run any step that changes the system
until every gate in section 0 is ticked and Aashish has approved this exact
revision. Background, design and rehearsal evidence are in
[scrum-134-postgres-redis-network.md](./scrum-134-postgres-redis-network.md).

- Operator: Gaurav. Approver: Aashish. Sanish deploys the worker afterwards.
- VM: `studyforge-api`, private IP `10.0.0.234` on `enp0s6`, public
  `132.226.88.147`, repository at `/home/ubuntu/studyforge`.
- Window: about 45 minutes, evening, announced in advance. The site is down
  from W1 to W6.
- Every step lists what you should see. If you see something else, stop and
  follow the rollback named in that step. Never improvise during the window.
- No secret value is ever pasted into chat, Jira, a commit, or a command
  line. Secrets go into root-only files and are read from there.

## 0. Gates (all required before the window is booked)

| Gate | Check | Status |
|---|---|---|
| G1 | Five consecutive `infrastructure/secure-transport/rehearse.sh` runs on the reviewed commit: `REHEARSAL PASSED`, zero ACL denials, the pinned-version checks pass. | **done** 2026-11-21 on `b6d601b`: 5/5 runs, 50/50 checks, zero denials (summaries in the SCRUM-134 doc) |
| G2 | The VM checkout contains the reviewed `docker-compose.secure.yml` and `infrastructure/secure-transport/`, deployed through the normal deploy (with SCRUM-127, so Django is not deployed twice). The working tree is clean. | open |
| G3 | The OKE source CIDR is verified (P4) and written into this doc. | open |
| G4 | Sanish has decided what happens to the job already waiting in `document-processing` (the first OKE worker will process it). | open |
| G5 | Aashish has approved this revision; the window date is announced to the team. | open |

## Prep on the laptop (any day before; no service impact)

P1. Generate the material into a private directory outside the repository:

```sh
cd ~/Projects/Personal/studyforge
umask 077
OUT=~/studyforge-sf134-prod            # never inside the repository
infrastructure/secure-transport/generate-certs.sh "$OUT/tls" IP:127.0.0.1,IP:10.0.0.234 --encrypt-ca-key
infrastructure/secure-transport/generate-redis-acl.sh "$OUT/acl"
printf 'PROCESSING_DB_PASSWORD=%s\nPROCESSING_DB_MIGRATOR_PASSWORD=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >"$OUT/processing-db.env"
openssl x509 -in "$OUT/tls/postgres.crt" -noout -ext subjectAltName -enddate
openssl x509 -in "$OUT/tls/redis.crt" -noout -ext subjectAltName -enddate
```

Expect: both SAN lists show `IP Address:127.0.0.1, IP Address:10.0.0.234`.
Record the `notAfter` date (397 days) as a renewal reminder. Keep the CA
passphrase in your password manager. `ca.key` never leaves the laptop.

P2. Split the credentials. The VM gets only what it uses:

```sh
grep -E '^REDIS_(OPS|DJANGO)_PASSWORD=' "$OUT/acl/redis-credentials.env" >"$OUT/vm-redis.env"
```

`REDIS_WORKER_PASSWORD` and `PROCESSING_DB_PASSWORD` are also needed by the
Kubernetes Secret (step H). `PROCESSING_DB_PASSWORD` must also be on the VM
once, for provisioning.

## Pre-flight on the VM (read-only; the day of the window)

```sh
ssh -i ~/.ssh/studyforge-api-vm-gaurav -o IdentitiesOnly=yes \
  -o UserKnownHostsFile=~/.ssh/known_hosts.studyforge-api ubuntu@132.226.88.147
```

P3. Record each result:

```sh
cd ~/studyforge
git status --porcelain                                   # expect: empty
git log -1 --format='%H %s'                              # record the commit
grep -c '+incrby' infrastructure/secure-transport/redis-users.acl.template   # expect: 1
docker compose version                                   # expect: v2.24+ (seen: 5.7.1)
docker compose ps --format '{{.Name}} {{.State}}' db redis   # expect: studyforge-db-1 running, studyforge-redis-1 running
docker port studyforge-db-1; docker port studyforge-redis-1  # expect: 5432 and 6379 (on 0.0.0.0 and [::] today)
test -f .env && echo "project .env present" || echo "no project .env"
ip -4 -o addr show enp0s6                                # expect: inet 10.0.0.234/...
docker exec studyforge-db-1 psql -U studyforge -d postgres -tAc \
  "select rolname, left(rolpassword, 13) from pg_authid where rolname = 'studyforge'"
                                                         # expect: studyforge|SCRAM-SHA-256
docker exec studyforge-redis-1 redis-cli LLEN document-processing   # record (was 1)
docker exec studyforge-redis-1 redis-cli LLEN celery                # record
docker exec studyforge-redis-1 redis-cli DBSIZE                     # record
systemctl is-active studyforge-gunicorn studyforge-celery           # expect: active active
df -h / | tail -1                                        # expect: several GB free
```

Stop if the role password is not `SCRAM-SHA-256` (Django would be refused by
the new HBA rule), the private IP differs, or the working tree is not clean.

P4. Verify the OKE source address (read-only OCI, laptop). Profile flags:
`--profile studyforge-gaurav --auth security_token`.

```sh
oci ce cluster get --cluster-id "$CLUSTER_ID" --query 'data."cluster-pod-network-options"'
oci ce node-pool list --compartment-id "$COMPARTMENT_ID" --cluster-id "$CLUSTER_ID" \
  --query 'data[].{name:name, pods:"node-config-details"."node-pool-pod-network-option-details"}'
oci network subnet get --subnet-id "$POD_OR_NODE_SUBNET_ID" --query 'data."cidr-block"'
oci network nsg rules list --nsg-id "$PODS_NSG_ID" --direction EGRESS --all
oci network vnic get --vnic-id "$API_VNIC_ID" --query 'data."nsg-ids"'
```

- `OCI_VCN_IP_NATIVE`: pods use their own IPs. The source is the pod subnet
  CIDR, and the source NSG is `studyforge-oke-pods-nsg`.
- `FLANNEL_OVERLAY`: traffic leaves from the node. The source is the node
  subnet CIDR, and the source NSG is the worker nodes' NSG instead.
- Pods/nodes egress must allow TCP 5432 and 6380 to `10.0.0.234`. If it does
  not, add one egress rule as part of N2 (this needs approval).
- The API VNIC NSG list must be `[]` (N2 replaces the list).

Write the result here as `OKE_SOURCE_CIDR=…` and `SOURCE_NSG=…` (gate G3).
The Cloud Shell test (C2) confirms the address PostgreSQL actually sees.

## Prep on the VM (before the window; no service impact)

P5. Copy the server material (never `ca.key`) and place it root-only:

```sh
# laptop
ssh … ubuntu@132.226.88.147 'install -d -m 700 ~/sf134-in'
scp -i ~/.ssh/studyforge-api-vm-gaurav -o IdentitiesOnly=yes -o UserKnownHostsFile=~/.ssh/known_hosts.studyforge-api \
  "$OUT"/tls/{ca.crt,postgres.crt,postgres.key,redis.crt,redis.key} "$OUT/acl/redis-users.acl" \
  "$OUT/vm-redis.env" "$OUT/processing-db.env" ubuntu@132.226.88.147:sf134-in/
```

```sh
# VM
sudo install -d -m 700 -o root -g root /etc/studyforge /etc/studyforge/tls
sudo install -m 644 -o root -g root ~/sf134-in/{ca.crt,postgres.crt,redis.crt} /etc/studyforge/tls/
sudo install -m 644 -o root -g root ~/sf134-in/ca.crt /etc/studyforge-client-ca.crt
sudo install -m 600 -o root -g root ~/sf134-in/{postgres.key,redis.key} /etc/studyforge/tls/
sudo install -m 600 -o root -g root ~/sf134-in/redis-users.acl /etc/studyforge/
sudo install -m 600 -o root -g root ~/sf134-in/vm-redis.env /etc/studyforge/redis-credentials.env
sudo install -m 600 -o root -g root ~/sf134-in/processing-db.env /etc/studyforge/processing-db.env
shred -u ~/sf134-in/* && rmdir ~/sf134-in
sudo tee /etc/studyforge/secure-transport.env >/dev/null <<'EOF'
STUDYFORGE_TLS_DIR=/etc/studyforge/tls
STUDYFORGE_REDIS_ACL_FILE=/etc/studyforge/redis-users.acl
STUDYFORGE_PRIVATE_IP=10.0.0.234
PG_REMOTE_TLS_CIDR=<OKE_SOURCE_CIDR from P4>
EOF
sudo openssl verify -CAfile /etc/studyforge/tls/ca.crt /etc/studyforge/tls/postgres.crt /etc/studyforge/tls/redis.crt
```

Expect: `postgres.crt: OK` and `redis.crt: OK`. Then dry-run the merged
Compose configuration (it prints nothing on success):

```sh
sudo -i
cd /home/ubuntu/studyforge
ENVS=(); [ -f .env ] && ENVS+=(--env-file .env); ENVS+=(--env-file /etc/studyforge/secure-transport.env)
docker compose "${ENVS[@]}" -f docker-compose.yml -f docker-compose.secure.yml config --quiet && echo CONFIG OK
```

`--env-file` turns off automatic loading of the project `.env`, so `ENVS`
passes it explicitly when it exists. Use the same `ENVS` in W3.

## Window

Use one root shell for the whole window (`sudo -i`, then
`cd /home/ubuntu/studyforge`). Define these helpers once:

```sh
ENVS=(); [ -f .env ] && ENVS+=(--env-file .env); ENVS+=(--env-file /etc/studyforge/secure-transport.env)
secure() { docker compose "${ENVS[@]}" -f docker-compose.yml -f docker-compose.secure.yml "$@"; }
rops() { ( . /etc/studyforge/redis-credentials.env; REDISCLI_AUTH=$REDIS_OPS_PASSWORD \
  docker exec -e REDISCLI_AUTH studyforge-redis-1 redis-cli --user studyforge_ops "$@" ); }
TS=$(date -u +%Y%m%dT%H%M%SZ); B=/var/backups/studyforge; install -d -m 700 "$B"
```

`REDISCLI_AUTH` keeps passwords out of process listings.

**W1. Announce and stop writers** (rollback: start them again).

```sh
systemctl stop studyforge-gunicorn studyforge-celery
systemctl is-active studyforge-gunicorn studyforge-celery   # expect: inactive inactive
```

**W2. Back up** (rollback: nothing changed yet).

```sh
cp -p /etc/studyforge.env "$B/studyforge.env.$TS"
( umask 077; docker exec studyforge-db-1 pg_dump -U studyforge -d studyforge -Fc >"$B/studyforge-$TS.dump" )
docker exec -i studyforge-db-1 pg_restore -l <"$B/studyforge-$TS.dump" | grep -c ' TABLE '   # expect: > 0
docker exec studyforge-redis-1 redis-cli SAVE                                  # expect: OK
( umask 077; docker cp studyforge-redis-1:/data/dump.rdb "$B/redis-$TS.rdb" )
ls -l "$B"                                                                      # expect: four files, mode -rw-------
```

**W3. Upgrade PostgreSQL and Redis in place** (on failure: R1).

```sh
secure up -d --wait --no-deps db redis
docker exec studyforge-db-1 psql -U studyforge -d postgres -tAc 'show ssl'       # expect: on
docker port studyforge-db-1; docker port studyforge-redis-1
  # expect only 127.0.0.1:5432, 10.0.0.234:5432, 127.0.0.1:6379, 10.0.0.234:6380
docker exec studyforge-redis-1 redis-cli ping                                  # expect: NOAUTH …
rops ACL LIST | grep -c '^user default off'                                    # expect: 1
rops LLEN document-processing; rops LLEN celery; rops DBSIZE                   # expect: the P3 values
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' studyforge-db-1 studyforge-redis-1   # expect: unless-stopped x2
rops ACL LOG RESET
```

**W4. Provision and migrate the processing database** (on failure: R1; the
empty database is harmless and can stay).

```sh
cd /home/ubuntu/studyforge/services/document-processing
PY=/home/ubuntu/studyforge/backend/.venv/bin/python
( set -a; . /etc/studyforge.env; . /etc/studyforge/processing-db.env; set +a
  env -u DJANGO_SETTINGS_MODULE \
    PROCESSING_DB_NAME=studyforge_processing PROCESSING_DB_USER=studyforge_processing \
    PROCESSING_DB_OWNER=studyforge_processing_owner PROCESSING_DB_MIGRATOR=studyforge_processing_migrator \
    PROCESSING_DB_HOST=127.0.0.1 PROCESSING_DB_PORT=5432 PROCESSING_DB_SSLMODE=verify-full \
    PROCESSING_DB_SSLROOTCERT=/etc/studyforge/tls/ca.crt PROCESSING_APPLICATION_DB="${POSTGRES_DB:-studyforge}" \
    PROCESSING_DB_ADMIN_USER="${POSTGRES_USER:-studyforge}" PROCESSING_DB_ADMIN_PASSWORD="$POSTGRES_PASSWORD" \
    "$PY" -B provision_database.py )
# Migrations use only the migrator: /etc/studyforge.env is deliberately not loaded here.
( set -a; . /etc/studyforge/processing-db.env; set +a
  env -u DJANGO_SETTINGS_MODULE PROCESSING_SECRET_KEY="$(openssl rand -hex 16)" \
    PROCESSING_DB_NAME=studyforge_processing PROCESSING_DB_USER=studyforge_processing_migrator \
    PROCESSING_DB_PASSWORD="$PROCESSING_DB_MIGRATOR_PASSWORD" PROCESSING_DB_HOST=127.0.0.1 PROCESSING_DB_PORT=5432 \
    PROCESSING_DB_SSLMODE=verify-full PROCESSING_DB_SSLROOTCERT=/etc/studyforge/tls/ca.crt \
    PGOPTIONS="-c role=studyforge_processing_owner" "$PY" -B manage.py migrate --noinput )
docker exec studyforge-db-1 psql -U studyforge -d studyforge_processing -tAc \
  "select string_agg(app||'|'||name, ',' order by name) from django_migrations"
  # expect: executions|0001_initial,executions|0002_callback_delivery
docker exec studyforge-db-1 psql -U studyforge -d studyforge_processing -tAc \
  "select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public'"
  # expect: studyforge_processing_owner
cd /home/ubuntu/studyforge
```

If `/etc/studyforge.env` names the database variables differently, map them
here. Do not read or print its values.

**W5. Configure TLS for Django and the legacy Celery worker** (on failure: R1).

Edit with `sudoedit /etc/studyforge.env`. Do not echo the file. Set:

```
POSTGRES_HOST=127.0.0.1
POSTGRES_SSLMODE=verify-full
POSTGRES_SSLROOTCERT=/etc/studyforge-client-ca.crt
CELERY_BROKER_URL='rediss://studyforge_django:<REDIS_DJANGO_PASSWORD>@10.0.0.234:6380/0?ssl_cert_reqs=required&ssl_ca_certs=/etc/studyforge-client-ca.crt&ssl_check_hostname=true'
STUDYFORGE_REQUIRE_SECURE_CONNECTIONS=1
```

Copy the password from `/etc/studyforge/redis-credentials.env`. It is hex,
so it needs no URL escaping. If `PASSWORD_RESET_CACHE_URL` is set, give it
the same value. If it is unset, it already follows the broker URL. Verify
both service users can read the public CA copy. Keep the existing application
database, SCRUM-127 private S3 settings, and matching processing service token.
Stop before starting the services if those prerequisites are missing.

**W6. Start Django and the legacy worker, then verify** (on failure: R1).

```sh
systemctl start studyforge-gunicorn studyforge-celery
sleep 10; systemctl is-active studyforge-gunicorn studyforge-celery          # expect: active active
journalctl -u studyforge-celery -n 40 --no-pager | grep -q 'Connected to rediss://studyforge_django' && echo 'Celery TLS connected'
curl -fsS https://studyforge-rodians.duckdns.org/api/v1/health/ && echo       # expect: healthy JSON
curl -fsS https://studyforge-rodians.duckdns.org/api/v1/ready/ && echo        # expect: ready JSON
( set -a; . /etc/studyforge/redis-credentials.env; set +a
  export SF134_BROKER_URL="rediss://studyforge_django:$REDIS_DJANGO_PASSWORD@10.0.0.234:6380/0?ssl_cert_reqs=required&ssl_ca_certs=/etc/studyforge-client-ca.crt&ssl_check_hostname=true"
  backend/.venv/bin/python -B infrastructure/secure-transport/broker_probe.py ping
  backend/.venv/bin/python -B infrastructure/secure-transport/broker_probe.py reset-cache
  backend/.venv/bin/python -B infrastructure/secure-transport/broker_probe.py send celery sf134-prod-check )
  # expect: ping: ok / reset-cache: ok / send: ok
journalctl -u studyforge-celery -n 40 --no-pager | grep 'celery.accumulate.*succeeded'   # expect: one line
rops ACL LOG 20                                                                # expect: empty
```

Then sign in to the site, open a course and upload a small test document.
Expect the upload to succeed. Its processing job waits in
`document-processing` until the OKE worker exists, which is the same as
today. Announce that the site is back.

## Network (same window or a later one; on failure: R2)

**N1. DOCKER-USER allow-list, persisted across Docker restarts and reboots.**

```sh
install -m 755 infrastructure/secure-transport/docker-user-allowlist.sh /usr/local/sbin/studyforge-docker-user-allowlist
install -m 644 infrastructure/secure-transport/studyforge-docker-user-allowlist.service /etc/systemd/system/
install -m 600 /dev/null /etc/studyforge/docker-user-allowlist.env
printf 'STUDYFORGE_PRIVATE_IP=10.0.0.234\nOKE_SOURCE_CIDR=%s\n' '<OKE_SOURCE_CIDR from P4>' >/etc/studyforge/docker-user-allowlist.env
systemctl daemon-reload
systemctl enable --now studyforge-docker-user-allowlist
studyforge-docker-user-allowlist status
  # expect: two DROP rules at the top of DOCKER-USER, "! <source>", ctorigdstport 5432 and 6380
```

This script has not run on Linux yet (shellcheck only). If `apply` errors,
run `studyforge-docker-user-allowlist remove` and stop. The ports are still
closed by the VCN security list at this point.

**N2. NSG on the API VNIC** (laptop, OCI). This is the step that opens the path.

```sh
P=(--profile studyforge-gaurav --auth security_token)
NSG_ID=$(oci network nsg create "${P[@]}" --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" \
  --display-name studyforge-api-data-nsg --wait-for-state AVAILABLE --query 'data.id' --raw-output)
oci network nsg rules add "${P[@]}" --nsg-id "$NSG_ID" --security-rules '[
 {"direction":"INGRESS","protocol":"6","source":"'"$SOURCE_NSG"'","sourceType":"NETWORK_SECURITY_GROUP","isStateless":false,
  "tcpOptions":{"destinationPortRange":{"min":5432,"max":5432}},"description":"SCRUM-134 PostgreSQL from OKE"},
 {"direction":"INGRESS","protocol":"6","source":"'"$SOURCE_NSG"'","sourceType":"NETWORK_SECURITY_GROUP","isStateless":false,
  "tcpOptions":{"destinationPortRange":{"min":6380,"max":6380}},"description":"SCRUM-134 Redis TLS from OKE"}]'
oci network vnic update "${P[@]}" --vnic-id "$API_VNIC_ID" --nsg-ids '["'"$NSG_ID"'"]'
oci network vnic get "${P[@]}" --vnic-id "$API_VNIC_ID" --query 'data."nsg-ids"'      # expect: [NSG_ID]
```

Record `NSG_ID` here. Add the egress rule from P4 only if P4 found it missing.

## OKE connectivity test (OCI Cloud Shell, private network on the OKE subnet)

C1. In Cloud Shell, choose **Network → Private network** on the OKE private
subnet. Then run `oci ce cluster create-kubeconfig --cluster-id "$CLUSTER_ID"
--kube-endpoint PRIVATE_ENDPOINT --file ~/.kube/config` and
`kubectl get nodes` (expect `10.0.1.63 Ready`).

C2. Create a temporary Secret from a file, then run one pod using the
already-published worker image:

```sh
umask 077; mkdir -p ~/sf134 && cd ~/sf134    # upload ca.crt here; write the env file by hand
cat >nettest.env <<'EOF'
PG_PASSWORD=<PROCESSING_DB_PASSWORD>
REDIS_URL=rediss://studyforge_worker:<REDIS_WORKER_PASSWORD>@10.0.0.234:6380/0?ssl_cert_reqs=required&ssl_ca_certs=/ca/ca.crt
EOF
kubectl -n studyforge create secret generic sf134-nettest --from-env-file=nettest.env --from-file=ca.crt=ca.crt
cat >nettest.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata: {name: sf134-nettest, namespace: studyforge}
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  nodeSelector: {kubernetes.io/arch: arm64}
  imagePullSecrets: [{name: ocir-pull-secret}]
  containers:
    - name: test
      image: phx.ocir.io/axcyydnoof5f/studyforge/document-processing@sha256:c07d7b5d5fd4b089f65617733e100f0f062cd76122fe10366c3496b0f14858f6
      command: ["python", "-c"]
      args:
        - |
          import os, socket, psycopg, redis
          kw = dict(host="10.0.0.234", port=5432, dbname="studyforge_processing", user="studyforge_processing",
                    password=os.environ["PG_PASSWORD"], connect_timeout=5)
          with psycopg.connect(sslmode="verify-full", sslrootcert="/ca/ca.crt", **kw) as c:
              print("PG ssl", c.info.pgconn.ssl_in_use, "seen as", c.execute("select inet_client_addr()::text").fetchone()[0])
          try:
              psycopg.connect(sslmode="disable", **kw); print("PG plaintext ACCEPTED (bad)")
          except psycopg.OperationalError:
              print("PG plaintext refused")
          print("REDIS ping", redis.Redis.from_url(os.environ["REDIS_URL"], socket_timeout=5).ping())
          s = socket.socket(); s.settimeout(3)
          try:
              s.connect(("10.0.0.234", 6379)); print("6379 OPEN (bad)")
          except OSError as e:
              print("6379 closed", type(e).__name__)
      envFrom: [{secretRef: {name: sf134-nettest}}]
      volumeMounts: [{name: ca, mountPath: /ca, readOnly: true}]
      securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}
  volumes:
    - name: ca
      secret: {secretName: sf134-nettest, items: [{key: ca.crt, path: ca.crt}]}
EOF
kubectl apply -f nettest.yaml
kubectl -n studyforge wait --for=jsonpath='{.status.phase}'=Succeeded pod/sf134-nettest --timeout=120s
kubectl -n studyforge logs sf134-nettest
```

Expect:

```
PG ssl True seen as 10.0.1.x        # must fall inside OKE_SOURCE_CIDR
PG plaintext refused
REDIS ping True
6379 closed TimeoutError            # or ConnectionRefusedError
```

C3. Clean up, every time, even after a failure:

```sh
kubectl -n studyforge delete pod/sf134-nettest secret/sf134-nettest --ignore-not-found
kubectl -n studyforge get pod,secret | grep sf134 || echo "clean"
shred -u ~/sf134/nettest.env; rm -rf ~/sf134
```

Then switch Cloud Shell back to the public network. On the VM, run
`rops ACL LOG 20` (expect empty) and `studyforge-docker-user-allowlist status`
(expect the 5432/6380 rule counters unchanged, because the allowed source is
never dropped).

## Handoff to Sanish

H1. Give Sanish the non-secret values:

| Object | Key | Value |
|---|---|---|
| ConfigMap `studyforge-processing-trust` | `postgres-ca.pem`, `redis-ca.pem` | contents of `ca.crt` (public) |
| ConfigMap `studyforge-processing-runtime` | `PROCESSING_DB_HOST` / `_PORT` / `_NAME` / `_USER` | `10.0.0.234` / `5432` / `studyforge_processing` / `studyforge_processing` |

H2. Two Secret keys in `studyforge-processing-secrets` come from this work:
`PROCESSING_DB_PASSWORD` (the runtime password) and `PROCESSING_REDIS_URL`
(`rediss://studyforge_worker:<REDIS_WORKER_PASSWORD>@10.0.0.234:6380/0?ssl_cert_reqs=required&ssl_ca_certs=/etc/studyforge/trust/redis-ca.pem`).
Add them with Sanish in one session, creating the Secret from a temporary
`0600` file (never `--from-literal`). Do not send them over chat. The
storage and Gemini keys are not part of SCRUM-134.

After OKE access is restored, confirm the worker objects are absent and
obtain approval for each create or apply below. Set `ca_file` to the public
CA from P1 and `worker_env_file` to the approved mode-0600 handoff. The
handoff must include the two values above, `PROCESSING_SECRET_KEY`,
`PROCESSING_SERVICE_TOKEN` matching Django, `GEMINI_API_KEY`, and
`PROCESSING_STORAGE_ACCESS_KEY_ID` plus
`PROCESSING_STORAGE_SECRET_ACCESS_KEY` from the read-only worker identity.

```sh
kube=(kubectl --kubeconfig "$HOME/.kube/studyforge-oke-bastion" -n studyforge)
"${kube[@]}" apply --dry-run=server --validate=strict -f services/document-processing/oke-worker.yaml
"${kube[@]}" create configmap studyforge-processing-trust --from-file=postgres-ca.pem="$ca_file" --from-file=redis-ca.pem="$ca_file"
"${kube[@]}" create secret generic studyforge-processing-secrets --from-env-file="$worker_env_file"
"${kube[@]}" apply --validate=strict -f services/document-processing/oke-worker.yaml
"${kube[@]}" rollout status deployment/processing-worker --timeout=5m
```

Once the single worker is healthy and KEDA is installed, set
`scaler_env_file` to a separate approved mode-0600 file with `tls=enable`,
`username=studyforge_scaler`, and `password` from
`REDIS_SCALER_PASSWORD`. Use the corresponding Redis ACL generated in P1.
Review and approve both changes before running them.

```sh
"${kube[@]}" create secret generic studyforge-processing-scaler --from-env-file="$scaler_env_file" --from-file=ca="$ca_file"
"${kube[@]}" apply --validate=strict -f services/document-processing/oke-worker-autoscaling.yaml
```

## Rollback

**R1: PostgreSQL/Redis/Django** (from any of W3 to W6):

```sh
systemctl stop studyforge-gunicorn studyforge-celery
cp -p "$B/studyforge.env.$TS" /etc/studyforge.env
docker compose up -d --wait --no-deps db redis        # base file only; reuses both data volumes
docker exec studyforge-db-1 psql -U studyforge -d postgres -tAc 'show ssl'   # expect: off
docker exec studyforge-redis-1 redis-cli ping                               # expect: PONG
docker exec studyforge-redis-1 redis-cli LLEN document-processing           # expect: the P3 value
systemctl start studyforge-gunicorn studyforge-celery
curl -fsS https://studyforge-rodians.duckdns.org/api/v1/health/
```

Only if data is missing, restore it. PostgreSQL: `pg_restore --clean
--if-exists -U studyforge -d studyforge` from `$B/studyforge-$TS.dump`
through `docker exec -i`. Redis: stop the container, `docker cp` the `.rdb`
back to `/data/dump.rdb`, and start it. The processing database and its roles
stay; dropping them is a separate decision.

**R2: network:**

```sh
oci network vnic update "${P[@]}" --vnic-id "$API_VNIC_ID" --nsg-ids '[]' --force
oci network nsg delete "${P[@]}" --nsg-id "$NSG_ID" --force
systemctl disable --now studyforge-docker-user-allowlist   # its ExecStop removes the rules
```

## After the window

- Update [scrum-134-postgres-redis-network.md](./scrum-134-postgres-redis-network.md)
  with the evidence above (no secret values).
- Warn the team in the deployment doc: running plain `docker compose up` in
  `~/studyforge` drops the override and reverts to plaintext, anonymous
  services. The deploy script does not run Compose. Follow-up: make the
  override the default on the VM (for example `COMPOSE_FILE` in the project
  `.env`).
- Calendar reminder: renew the server certificates before the P1 `notAfter` date.
- Keep `/var/backups/studyforge` until the worker has run cleanly for a week,
  then delete it (it contains password hashes).
