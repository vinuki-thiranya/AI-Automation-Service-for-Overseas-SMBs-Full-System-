# RUNBOOK — Nuvadesk control plane

Operational procedures for the one VPS that runs n8n, Postgres, Caddy, Uptime Kuma and the backup sidecar. Every command runs from the repo root on the server (`/opt/nuvadesk`) as the `nuvadesk` user, unless a step says otherwise.

| | |
|---|---|
| n8n editor + webhooks | `https://ops.<DOMAIN>` |
| Status / monitors | `https://status.<DOMAIN>` |
| Backups | Backblaze B2 `b2://<B2_BUCKET>/nuvadesk/{n8n,supabase,uptime-kuma}/` (30 days) |
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
- the `nuvadesk` user (docker + sudo groups) with your SSH key
- sshd hardening (keys only, no root)
- ufw (22, 80, 443/tcp + udp) and fail2ban
- 2 GB swap
- a deploy key, and a clone of the repo to `/opt/nuvadesk`

## 2. First boot (≈ 15 min)

```bash
ssh nuvadesk@<ip>
cd /opt/nuvadesk
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
| nuvadesk-core | HTTP(s) – Keyword | `https://ops.<DOMAIN>/in/<any live client_id>/health`, keyword `ok` |
| Each client | HTTP(s) – Keyword | `https://ops.<DOMAIN>/in/<client_id>/health`, keyword `"ok":true`. Alert also on keyword `"degraded":true` (repeated failures). |
| Client dashboard | HTTP(s) | dashboard URL (Phase 3) |
| Backup freshness | Push | Create a Push monitor with a 26 h heartbeat. Put its URL (`http://uptime-kuma:3001/api/push/<token>`) in `BACKUP_PUSH_URL`. |

Uptime Kuma itself is not monitored from inside the box. Add a free external check (for example a second Uptime Kuma instance, or Cloudflare health checks) on `https://status.<DOMAIN>` if you want that covered.

## 4. Daily operations

| Task | Command |
|---|---|
| Status and health | `make ps` |
| Logs | `make logs s=core` (or `n8n`, `caddy`, `backup`, `postgres`, `uptime-kuma`) |
| Run the core scheduler now | `docker compose --project-directory infra -f infra/docker-compose.yml exec core node -e "fetch('http://127.0.0.1:8080/v1/jobs/tick',{method:'POST',headers:{authorization:'Bearer '+process.env.CORE_JOB_TOKEN}}).then(r=>r.text()).then(console.log)"` |
| Restart one service | `make restart s=n8n` |
| Back up now | `make backup` |
| Export workflows now | `make export-workflows` |
| List backups | `make restore-list` |
| Static checks (also on your laptop) | `make validate` |

**Schedules** (container TZ, default Asia/Colombo):
- 02:00 database dump to B2 (n8n Postgres, Supabase if `SUPABASE_DB_URL` is set, Uptime Kuma data), then prune anything older than 30 days.
- 02:30 workflow export to Git.
- n8n → core (n8n timezone): every 5 min `/v1/jobs/tick` (reminders, no-shows, nurture, escalation timeouts); 03:00 `/v1/jobs/nightly` (metrics rollup, transcript retention purge); hourly at :05 `/v1/jobs/reports` (daily digest at 07:00 and the weekly report, both in each client's timezone).

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
- Optional hardening: put `ops.<DOMAIN>` behind Cloudflare Access for the editor UI only (bypass for `/in/*`, `/widget.js`, `/webhook/*` and `/healthz`).
- nuvadesk-core is only reachable through Caddy at `/in/*` and `/widget.js`. `/v1/jobs/*` is internal (n8n → `core:8080`) and also needs the bearer `CORE_JOB_TOKEN`.

## 9. Phase 2 deploy: nuvadesk-core and Supabase (once)

1. **Supabase project** in Sydney (`ap-southeast-2`). In the SQL editor, run `supabase/migrations/20261104000000_init.sql`, then `20261105000000_phase2.sql`, in that order. (Or `supabase db push` with the Supabase CLI linked to the project.)
2. In the Supabase dashboard, enable **Vault** (Integrations → Vault) and **pg_cron** if you want the database to purge transcripts itself; the nightly n8n job already calls `purge_expired_transcripts()`.
3. In `infra/.env`, set `SUPABASE_AU_URL`, `SUPABASE_AU_SERVICE_ROLE_KEY`, `META_APP_SECRET`, and `GOOGLE_OAUTH_CLIENT_ID/SECRET`. `make first-boot` adds `CORE_SECRET` and `CORE_JOB_TOKEN` if they're missing.
4. Deploy: `make update`. This pulls main, takes a backup, builds `nuvadesk/core`, and recreates Caddy with the `/in/*` route.
5. `make bootstrap`. This installs the three core schedules and the `agency/core-jobs` credential next to the error workflow.
6. Check: `curl -s https://ops.<DOMAIN>/widget.js | head -3` serves the widget, and `make logs s=core` shows `Server listening`.

## 10. Provisioning a client (each deal, build days 0–6)

1. Copy `config/clients/demo-clinic.json` to `config/clients/<client_id>.json` and fill it from the discovery call and access checklist. Run `make validate`.
2. Create `config/clients/<client_id>.secrets.json`. It is gitignored; never commit it. Shapes:
   ```json
   {
     "<id>/anthropic": "sk-ant-…",                       "<id>/openai": "sk-proj-…",
     "<id>/whatsapp": "<Meta system-user token>",        "<id>/resend": "re_…",
     "<id>/twilio": { "account_sid": "AC…", "auth_token": "…" },
     "<id>/google": { "refresh_token": "…" },            "<id>/cliniko": "<api key ending -au1>",
     "<id>/acuity": { "user_id": "…", "api_key": "…" },  "<id>/microsoft": { "tenant_id": "…", "client_id": "…", "client_secret": "…" },
     "<id>/calendly": "<token>",  "<id>/hubspot": "<private app token>",  "<id>/telegram": { "bot_token": "…" }
   }
   ```
   Create the Anthropic key in a **workspace for this client with a monthly spend limit**, and the OpenAI key in a project with a budget.
3. Dry run: `node scripts/new-client.ts config/clients/<id>.json --secrets config/clients/<id>.secrets.json`. Fix every ✗.
4. Apply: add `--apply`. This upserts the clients row, stores the secrets in Vault, embeds the FAQ, creates and tags the `<id> — events` n8n workflow, and registers the Telegram webhook if used. It then prints the URLs for step 5.
5. Wire the providers with the printed values:
   - Meta: callback URL and verify token; subscribe to `messages`; submit the listed templates.
   - Twilio number: Messaging and Voice webhooks.
   - The clinic's phone system: conditional call-forward (no answer or busy) to the Twilio number.
   - The client's website: the web chat snippet.
   - Web forms or Zapier: the lead URL.
   - Uptime Kuma: the client health monitor.
6. QA for this client:
   - Copy `qa/conversations/dental/` to `qa/conversations/<id>/`.
   - Adjust service IDs, prices and FAQ answers to the client's.
   - Run `npm run qa -- --vertical <id> --config config/clients/<id>.json`, then add `--live`.
   - Hand over to the client for UAT on a test number.
7. Delete the local `*.secrets.json` once Vault has the secrets, or move it to your password manager.

## 11. Demo clinic go-live checklist (public demo number, spec §9)

- [ ] §9 done (Supabase project, migrations, core deployed, bootstrap).
- [ ] A Meta WhatsApp test number. Put its `phone_number_id` in `demo-clinic.json`, replacing `REPLACE_WITH_META_PHONE_NUMBER_ID`.
- [ ] Two Google calendars for the fictional dentists, shared with the Google account that consents via OAuth. Put their calendar IDs in `demo-clinic.json` and the refresh token in the secrets file.
- [ ] A Google Sheet for the CRM. Put its ID in `crm.sheet_id`.
- [ ] Staff phones in `escalation.staff` and `owner_backup` changed to your own numbers.
- [ ] `node scripts/new-client.ts config/clients/demo-clinic.json --secrets … --apply`, then wire the printed URLs.
- [ ] Text the demo number: ask the hours, book a check-up, ask for a person, then reply from a staff phone.
- [ ] Record the two demo videos (spec §9, weeks 1–2).
