# Deploying to Oracle Cloud (Always Free)

This is the runbook for running blw-app on an Oracle Cloud "Always Free" Ampere A1
VM: app + Postgres in Docker Compose behind Caddy, for $0/mo plus the cost of a
domain name (or $0 during beta on DuckDNS).

## 1. Provision the VM

1. Sign up for an Oracle Cloud account. A credit card is required for identity
   verification but is never charged for Always Free resources.
2. Pick your home region carefully at signup — Always Free capacity is
   region-bound and you can't move it later. If your preferred region shows
   "Out of capacity" for Ampere A1 shapes, that's common; keep retrying
   (a few minutes to a few days depending on region/time of day) rather than
   switching regions, since switching forfeits your Always Free allotment in
   the original region.
3. Create a Compute instance:
   - Shape: **VM.Standard.A1.Flex** (Ampere, arm64). 2 OCPU / 12 GB RAM is
     plenty; the Always Free tier covers up to 4 OCPU / 24 GB total across
     your A1 instances if you want more headroom.
   - Image: **Ubuntu 24.04 (aarch64)**.
   - Add your SSH public key during creation (or upload one after).
   - Boot volume: the default (50 GB) is fine; Always Free covers up to
     200 GB total across your block volumes.
4. Note the instance's public IP — you'll point DNS at it and use it for the
   `VM_HOST` GitHub secret below.

## 2. Open the firewall — twice

Oracle's Ubuntu images ship with **both** a cloud-level firewall (the VCN
security list) **and** a restrictive host-level `iptables`/netfilter
configuration. Caddy being unreachable from the internet after you've
"opened" only one of these is the classic gotcha here — you need both.

### 2a. VCN security list (cloud firewall)

In the OCI console: **Networking → Virtual Cloud Networks →** (your VCN) **→
Security Lists →** (the list attached to your instance's subnet) **→ Add
Ingress Rules**. Add two rules, both with source CIDR `0.0.0.0/0`:

| Protocol | Destination port |
|---|---|
| TCP | 80 |
| TCP | 443 |

### 2b. Instance OS firewall (iptables)

SSH into the VM (`ssh ubuntu@<VM_HOST>`) and open the same ports at the OS
level:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
```

Ubuntu 24.04 on Oracle images persists iptables rules via
`netfilter-persistent`. Save the rules so they survive a reboot:

```bash
sudo apt-get update
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

Verify from your own machine once both are done: `curl -I http://<VM_HOST>`
should get a response (even a 404/502 before the app is deployed means the
port is reachable — a hang or connection refused means one of the two
firewalls above still needs fixing).

## 3. Install Docker Engine

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Optional: run docker without sudo
sudo usermod -aG docker "$USER"
newgrp docker
```

The Docker apt repo publishes `arm64` packages, so this installs the native
arm64 build of Docker Engine — no emulation needed on the VM itself (emulation
only happens in CI, cross-building the image for arm64 from an x86 runner).

Confirm with `docker compose version` (the Compose v2 plugin, invoked as
`docker compose`, not the old standalone `docker-compose`).

## 4. Point DNS at the VM

**Option A — real domain.** Add an `A` record for your domain (or a
subdomain, e.g. `app.example.com`) pointing at the VM's public IP.

**Option B — DuckDNS (free, good for beta).** Create a free subdomain at
[duckdns.org](https://www.duckdns.org) (e.g. `blw-app.duckdns.org`) pointed
at the VM's IP. Caddy's automatic HTTPS works the same either way — it just
needs a resolvable hostname with port 80 reachable for the ACME HTTP-01
challenge. Swap in a real domain later by changing `DOMAIN` in `.env` and
restarting Caddy; no code changes needed.

## 5. Set up `/opt/blw`

On the VM:

```bash
sudo mkdir -p /opt/blw
sudo chown "$USER":"$USER" /opt/blw
cd /opt/blw
```

Copy `docker-compose.yml` and `Caddyfile` from the repo onto the VM (`scp`
from your machine, or `curl` the raw GitHub URLs — this directory is **not**
a git checkout on the VM; it's just the two files plus `.env`):

```bash
scp docker-compose.yml Caddyfile ubuntu@<VM_HOST>:/opt/blw/
```

Then create `/opt/blw/.env` on the VM (this file is never committed —
`.gitignore` at the repo root already excludes `.env*`). Every variable the
stack reads:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>` — must use the same three values as the `POSTGRES_*` vars below, and the `db` hostname (the Compose service name), not the VM's IP. |
| `POSTGRES_USER` | yes | Used by the `db` service to initialize Postgres. |
| `POSTGRES_PASSWORD` | yes | Generate with `openssl rand -base64 24`. |
| `POSTGRES_DB` | yes | Database name, e.g. `blw`. |
| `DOMAIN` | yes | The hostname from step 4, e.g. `app.example.com` or `blw-app.duckdns.org`. Caddy reads this to request/renew its TLS cert. |
| `BETTER_AUTH_SECRET` | yes | Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | yes | The public origin, e.g. `https://app.example.com`. |
| `GOOGLE_CLIENT_ID` | optional | Only needed to enable "Sign in with Google". |
| `GOOGLE_CLIENT_SECRET` | optional | Pairs with the above. |
| `RESEND_API_KEY` | optional | Needed for verification/password-reset emails; the app should still run without it. |
| `KEY_ENCRYPTION_SECRET` | yes | Encrypts each user's own Anthropic API key at rest (AES-256-GCM). Generate with `openssl rand -base64 32` and never rotate it without a migration plan — rotating it without re-encrypting existing rows locks users out of their saved key. |

Example:

```bash
cat > /opt/blw/.env <<'EOF'
POSTGRES_USER=blw
POSTGRES_PASSWORD=change-me-generate-a-real-one
POSTGRES_DB=blw
DATABASE_URL=postgres://blw:change-me-generate-a-real-one@db:5432/blw
DOMAIN=app.example.com
BETTER_AUTH_SECRET=change-me-generate-a-real-one
BETTER_AUTH_URL=https://app.example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
KEY_ENCRYPTION_SECRET=change-me-generate-a-real-one
EOF
chmod 600 /opt/blw/.env
```

Bring the stack up:

```bash
cd /opt/blw
docker compose up -d --wait
docker compose logs -f app   # first boot runs migrations + seeds; watch it succeed
```

Once `docker compose ps` shows `app`, `db`, and `caddy` all healthy, visit
`https://<DOMAIN>` — Caddy issues its certificate on first request.

## 6. Wire up GitHub Actions deploys

`deploy.yml` builds and pushes an arm64 image on every push to `main`, then
SSHes in and redeploys — but only once you opt in.

**Repository variable** (Settings → Secrets and variables → Actions →
Variables tab):

- `DEPLOY_ENABLED` = `true` — the deploy job is a no-op until this is set,
  so CI can run safely on this repo long before the VM exists.

**Repository secrets** (same page, Secrets tab):

- `VM_HOST` — the VM's public IP or DNS name.
- `VM_USER` — `ubuntu` on the stock Oracle image.
- `VM_SSH_KEY` — the **private** half of a keypair whose public half is
  authorized on the VM (either the key you provisioned the instance with, or
  a dedicated deploy key added to `~/.ssh/authorized_keys` for `VM_USER`).
  Paste the raw PEM contents, not a path.

No registry secret is needed — the workflow pushes to GHCR using the
repo-scoped `GITHUB_TOKEN`, and a public repo gets unlimited free GHCR
storage/bandwidth.

The first deploy still needs step 5 done manually once (the workflow only
runs `docker compose pull app && docker compose up -d --wait` — it assumes
`/opt/blw/docker-compose.yml`, `Caddyfile`, and `.env` already exist).

## 7. Backups

Idle Oracle Always Free accounts can be reclaimed after a period of
inactivity, so offsite backups aren't optional here.

**Nightly dump, kept on-box:**

```bash
sudo mkdir -p /opt/blw/backups
cat > /opt/blw/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/blw
set -a; source .env; set +a
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "/opt/blw/backups/blw-$STAMP.sql.gz"
find /opt/blw/backups -name '*.sql.gz' -mtime +14 -delete
EOF
chmod +x /opt/blw/backup.sh
```

Add to root's crontab (`sudo crontab -e`):

```
0 3 * * * /opt/blw/backup.sh >> /var/log/blw-backup.log 2>&1
```

**Weekly offsite copy** — install [rclone](https://rclone.org/) and
configure a remote for Backblaze B2 or Cloudflare R2 (both have a free tier
well above what nightly Postgres dumps of this app need):

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config   # create a remote named "blw-offsite" pointing at your B2/R2 bucket
```

Weekly sync via cron:

```
0 4 * * 0 rclone sync /opt/blw/backups blw-offsite:blw-app-backups >> /var/log/blw-rclone.log 2>&1
```

### Restore procedure

```bash
cd /opt/blw
# Fetch the dump if it's not already on-box:
rclone copy blw-offsite:blw-app-backups/blw-<STAMP>.sql.gz /opt/blw/backups/

docker compose stop app
gunzip -c /opt/blw/backups/blw-<STAMP>.sql.gz | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose start app
```

For a full disaster recovery (new VM from scratch): repeat steps 1–5 above,
restore the `.env` file from wherever you keep it outside the VM (a password
manager — it's never in git), then run the restore procedure before
`docker compose up -d --wait` starts serving traffic.

## Known follow-up

`server/package.json`'s `db:migrate`/`db:seed` scripts run through `tsx`
directly against TypeScript source (the seed script lives outside the
compiled `src/` tree). The image installs the matching `tsx` version
globally so this works without carrying the rest of the devDependencies —
see the comment in `Dockerfile`. Moving `tsx` into `server/package.json`'s
`dependencies` would let the image drop that global install; harmless
either way, just flagging it as a small cleanup for whoever owns that file
next.
