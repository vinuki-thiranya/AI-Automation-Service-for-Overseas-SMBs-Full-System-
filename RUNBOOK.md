# RUNBOOK — Recallo control plane

Operational procedures for the one VPS that runs n8n, Postgres, Caddy, Uptime Kuma and the backup sidecar. Every command runs from the repo root on the server (`/opt/recallo`) as the `recallo` user, unless a step says otherwise.

| | |
|---|---|
| n8n editor + webhooks | `https://ops.<DOMAIN>` |
| Status / monitors | `https://status.<DOMAIN>` |
| Backups | Backblaze B2 `b2://<B2_BUCKET>/recallo/{n8n,supabase,uptime-kuma}/` (30 days) |
| Workflow history | `n8n/workflows/` in Git (nightly) |
| Alerts | Telegram alerts chat |
| Restore target | **Under 1 hour** from "server is gone" to "webhooks answering" |

> **The one secret you cannot lose:** `N8N_ENCRYPTION_KEY`. Without it every credential stored in n8n (client WhatsApp tokens, calendar OAuth, LLM keys) is unreadable, even from a perfect backup. Keep it in your password manager next to the B2 key.

---

## 1. Provision a server (≈ 15 min)

1. **Hetzner Cloud.** Create a CX22, Ubuntu 24.04. Use Falkenstein (EU/UK clients) or Ashburn (US clients); AU clients are served fine from either.
   - Add your SSH public key.
   - Enable backups only if you want Hetzner snapshots as a second safety net (+20%).
2. **Cloudflare DNS.** Create these records, proxied (orange cloud):
   | Type | Name | Content |
   |---|---|---|
   | A | `ops` | server IPv4 |
   | A | `status` | server IPv4 |
   | AAAA | `ops` / `status` | server IPv6 (optional) |

   Set SSL/TLS mode to **Full (strict)**. Caddy obtains real certificates through the DNS-01 challenge, so the proxy can stay on from the start.
3. **Cloudflare API token.** My Profile → API Tokens → Create Token → "Edit zone DNS" template, limited to this one zone. This becomes `CLOUDFLARE_API_TOKEN`.
4. **On the server, as root:**
   ```bash
   ssh root@<ip>
   curl -fsSL https://raw.githubusercontent.com/vinuki-thiranya/AI-Automation-Service-for-Overseas-SMBs-Full-System-/main/scripts/hetzner-setup.sh -o hetzner-setup.sh
   less hetzner-setup.sh
   bash hetzner-setup.sh
   ```
   The script pauses and prints a deploy key. Add it in GitHub → repo → Settings → Deploy keys, **with write access**, then press Enter. When it finishes, root SSH login is disabled.

What `hetzner-setup.sh` does, in order:
- apt upgrade and unattended-upgrades
- Docker Engine + compose plugin from Docker's repository
- the `recallo` user (docker + sudo groups) with your SSH key
- sshd hardening (keys only, no root)
- ufw (22, 80, 443/tcp + udp) and fail2ban
- 2 GB swap
- a deploy key, and a clone of the repo to `/opt/recallo`

## 2. First boot (≈ 15 min)

```bash
ssh recallo@<ip>
cd /opt/recallo
cp infra/.env.example infra/.env && chmod 600 infra/.env
nano infra/.env
make first-boot
```
In `infra/.env`, fill in `DOMAIN`, `ACME_EMAIL`, `CLOUDFLARE_API_TOKEN`, `B2_*` and `TELEGRAM_*`.

`first-boot` does the following:
- generates `POSTGRES_PASSWORD` and `N8N_ENCRYPTION_KEY`
- reuses the server's deploy key for the backup container
- builds Caddy (with the Cloudflare plugin) and the backup image
- starts everything and waits for Postgres and n8n to report healthy

Then:
1. Open `https://ops.<DOMAIN>` and create the n8n **owner** account.
2. In n8n, go to Settings → n8n API → **Create API key**. Put it in `infra/.env` as `N8N_API_KEY=`.
3. Run `make bootstrap`. It creates the `agency/telegram-alerts` credential, the **System — Error → Telegram** workflow and the smoke-test workflow, and recreates the backup container so it sees the API key. Note the error workflow ID it prints: every production workflow uses it as its *Error workflow*.
4. Run `make smoke-test`. A 🚨 message should reach Telegram within a minute.
5. **Copy `N8N_ENCRYPTION_KEY` into your password manager.**
6. Run `make backup` and confirm the dump shows up in the listing it prints.
7. Run `make export-workflows` and confirm a commit "n8n: nightly workflow export" appears on GitHub.

## 3. Monitoring (Uptime Kuma, ≈ 10 min)

Open `https://status.<DOMAIN>` and create the admin account. Choose SQLite as the database. Then add these monitors, each with a 60 s interval and Telegram notifications using the same bot and chat:

| Monitor | Type | Target |
|---|---|---|
| n8n health | HTTP(s) – Keyword | `https://ops.<DOMAIN>/healthz`, keyword `ok` |
| n8n editor TLS | HTTP(s) | `https://ops.<DOMAIN>/`, cert expiry notification on |
| Each client webhook | HTTP(s) | `https://ops.<DOMAIN>/webhook/<client_id>/health` (Phase 2 adds this endpoint per client) |
| Client dashboard | HTTP(s) | dashboard URL (Phase 3) |
| Backup freshness | Push | Phase 2: `backup.sh` pings a push URL on success; alert if no ping for 26 h |

Uptime Kuma itself is not monitored from inside the box. Add a free external check (for example a second Uptime Kuma instance, or Cloudflare health checks) on `https://status.<DOMAIN>` if you want that covered.

## 4. Daily operations

| Task | Command |
|---|---|
| Status and health | `make ps` |
| Logs | `make logs s=n8n` (or `caddy`, `backup`, `postgres`, `uptime-kuma`) |
| Restart one service | `make restart s=n8n` |
| Back up now | `make backup` |
| Export workflows now | `make export-workflows` |
| List backups | `make restore-list` |
| Static checks (also on your laptop) | `make validate` |

**Schedules** (container TZ, default Asia/Colombo):
- 02:00 database dump to B2 (n8n Postgres, Supabase if `SUPABASE_DB_URL` is set, Uptime Kuma data), then prune anything older than 30 days.
- 02:30 workflow export to Git.

Any failure sends ❌ to Telegram.

## 5. Updating

1. Change the pinned version in `infra/docker-compose.yml`, or in `infra/caddy/Dockerfile` / `infra/backup/Dockerfile`, on your laptop.
2. Read that release's changelog. n8n minor versions occasionally change node behaviour. Commit with a note on what you checked.
3. On the server, run `make update`. It pulls `main`, takes a backup first, rebuilds and pulls the pinned images, recreates the containers and waits for health.
4. Run `make smoke-test`, and open one live client workflow's latest executions.

**Rollback:** revert the version commit and run `make update`. If the database was migrated forward by a newer n8n, also restore the pre-update dump: `make restore ARGS="--from <stamp>"`.

## 6. Restore — target under 1 hour

### 6a. Same server, bad data or a bad upgrade (≈ 10 min)
```bash
make restore-list
make restore ARGS="--from 20261104T020000Z"    # or no ARGS for the newest dump
make smoke-test
```

### 6b. Server lost: rebuild on a fresh VPS (≈ 45 min)

| Step | Time | Action |
|---|---|---|
| 1 | 5 min | Create a new CX22 (section 1, step 1). Point the `ops` and `status` A records at the new IP. Cloudflare picks up the change within seconds. |
| 2 | 10 min | Run `hetzner-setup.sh` (section 1, step 4). A new deploy key gets added on GitHub; delete the old server's key. |
| 3 | 5 min | `cp infra/.env.example infra/.env`. Fill it from your password manager, **including the original `N8N_ENCRYPTION_KEY` and `POSTGRES_PASSWORD`** (first-boot only generates values that are still `CHANGE_ME`). |
| 4 | 10 min | `make first-boot`. n8n starts empty. |
| 5 | 5 min | `make restore ARGS="--kuma --yes"` restores the newest n8n dump and the Uptime Kuma data. |
| 6 | 5 min | Verify: log in at `https://ops.<DOMAIN>` with the *old* owner account. Open one client credential (it must open without a decryption error). Run `make smoke-test`. Send a test WhatsApp message to the demo number. |
| 7 | 5 min | Re-run `make bootstrap`. It is a no-op if the workflows exist, and it recreates the backup container. Then run `make backup`. |

**If the newest dump is bad:** use an older `--from`. If workflows changed after that dump, add `--workflows-from-git` to re-import the latest Git export on top. Credentials are not in Git, but they are restored from the dump.

**If `N8N_ENCRYPTION_KEY` is lost:** workflows restore, but every credential has to be re-entered per client. This is why the key lives in the password manager.

### 6c. Restore drill
Run 6b against a throwaway VPS and a throwaway subdomain (`DOMAIN=drill.<DOMAIN>`):
- before the first client goes live
- then once a quarter

Record the date and total time here:

| Date | Total time | Notes |
|---|---|---|
| _not yet run_ | | |

## 7. Incidents

| Signal | First checks | Fix |
|---|---|---|
| 🚨 workflow failed (Telegram) | Open the execution URL in the alert | Fix the node or credential. If the failure is client-facing, the Phase 2 fallback replies "we'll call you back" and escalates. |
| More than 3 failures in an hour for one client (spec §6.5) | `make logs s=n8n`, provider status pages (Meta, Twilio, Anthropic) | Phase 2: the conversation engine switches the client to the fallback model or the "we'll call you back" mode. Tell the client in their support channel. |
| n8n down (Uptime Kuma) | `make ps`, `make logs s=n8n`, `df -h`, `free -m` | `make restart s=n8n`. If Postgres is unhealthy, check disk space first. |
| TLS errors | `make logs s=caddy` | Check that the Cloudflare token is still valid and SSL mode is Full (strict). |
| ❌ backup failed (Telegram) | `make logs s=backup` | Usually B2 credentials or disk. Run `make backup` after fixing. Don't let two nights pass without a good dump. |
| Disk above 80% | `docker system df`, `du -sh /var/lib/docker/volumes/*` | `docker image prune -a`. Shorten `N8N_EXECUTIONS_MAX_AGE_HOURS`. |
| Suspected credential leak | — | Rotate at the provider. Update the n8n credential. If a Git leak, rotate first, then purge history. Record it in `audit_log`. |

## 8. Security notes
- Only Caddy publishes ports (80/443). Postgres, n8n and Uptime Kuma are reachable only on the internal Docker network.
- Docker's port publishing bypasses ufw, so never add `ports:` to other services.
- n8n blocks `$env` access in nodes (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`), so a workflow cannot read the encryption key or DB password.
- Execution data is pruned after 14 days, and successful executions are not saved. Client transcripts live in Supabase, where they are subject to retention.
- Workflow exports strip `pinData` and `staticData`, because they can hold customer data.
- Optional hardening: put `ops.<DOMAIN>` behind Cloudflare Access for the editor UI only (bypass for `/webhook/*` and `/healthz`).
