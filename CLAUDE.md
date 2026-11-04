# CLAUDE.md — Nuvadesk automation agency

Nuvadesk is a one-person AI-automation agency (Sri Lanka) that installs an AI front desk for dental and physio clinics in Australia, the UK and the US. The full business and system spec is [docs/spec.md](docs/spec.md); the engineering plan is [PLAN.md](PLAN.md). Read both before non-trivial work.

## What lives here
| Path | What |
|---|---|
| `infra/` | Control plane: `docker-compose.yml` (n8n + Postgres, nuvadesk-core, Caddy, Uptime Kuma, backup), Caddyfile, backup image |
| `core/` | **nuvadesk-core**: the TypeScript service behind `/in/*` (ingestion, conversation engine, booking, leads, CRM, escalation, reporting, jobs). Tests in `core/test/` |
| `qa/` | 50-conversation QA suite (`qa/conversations/<vertical>/*.yaml`, runner `qa/run.ts`) |
| `webchat/` | Embeddable chat widget served by core at `/widget.js` |
| `scripts/` | first-boot, update, backup, restore, Hetzner setup, n8n bootstrap, `new-client.ts`, `validate.sh` |
| `n8n/templates/` | Hand-maintained workflow templates: `system/` (alerts) and `packages/` (core schedules, per-client events hook) |
| `n8n/workflows/` | **Machine-written** nightly export of the live n8n instance — never hand-edit |
| `config/` | `client.schema.json` and one `clients/<client_id>.json` per client |
| `supabase/migrations/` | Shared multi-tenant schema (client_id + RLS on every table) |
| `docs/` | Spec, diagrams |
| `RUNBOOK.md` | Operations: deploy, restore in < 1 hour, incidents |

## Hard rules
1. **Infrastructure as code.** Every server, container, DNS record, migration and workflow is reproducible from this repo. No click-ops change survives unless it is written back here the same day.
2. **No shared API keys.** Every client has its own LLM key (with a spend cap), Twilio sub-account, WhatsApp number and CRM/calendar credentials. Agency-level keys are never used for client traffic.
3. **Never commit secrets.** Only `*.env.example` files with placeholder values. `client.json` holds *credential references* (`<client_id>/<name>`, resolved in the n8n credential store or Supabase Vault), never values. Run `git diff --cached` and look before every commit.
4. **Every n8n workflow is exported to Git.** The backup container exports nightly to `n8n/workflows/`. Template changes go into `n8n/templates/` by hand and are re-imported — the UI is not the source of truth.
5. **50-conversation QA before any prompt change ships.** Any change to a system prompt (`core/src/engine/prompt.ts`), tool definition (`engine/tools.ts`), guardrail or retrieval setting runs `npm run qa` (mock, must be 50/50) **and** `npm run qa -- --live` (must be ≥ 48/50). Note both results in the commit message.
6. **UI work uses the frontend-design and UI UX Pro Max skills** (and Framer Motion) for the client dashboard and agency website. Both are vendored in `.claude/skills/` (see each `SOURCE.md` for the pinned upstream commit, licence and review). Run UI UX Pro Max's search from the repo root. Its output is a recommendation; the frontend-design brief and these rules win. Update a skill only from its upstream tagged release, and only after the same review.
7. **Pin versions.** Docker images, npm packages and Caddy plugins use exact versions; upgrades are deliberate commits that note the changelog read.
8. **Every client build starts from `main`.** After a client goes live, extract whatever was custom back into the templates.
9. **Compliance is a feature, not a footnote.** Every automated first message discloses it is automated; every SMS flow handles STOP; marketing SMS requires recorded consent; US health clinics store only name, phone and appointment time.

## Conventions
- Shell: `bash`, `set -euo pipefail`, run on the Ubuntu VPS (the dev laptop is Windows — no Docker there; validate statically).
- Compose is always run as `docker compose --project-directory infra -f infra/docker-compose.yml`; the `Makefile` wraps this.
- SQL migrations are forward-only, named `YYYYMMDDHHMMSS_name.sql`, and every table has `client_id` + RLS.
- LLM: Claude (`claude-sonnet-5-5` conversation, `claude-haiku-5-5` guardrails/classification) with OpenAI as the outage fallback; embeddings are OpenAI `text-embedding-3-small` (1536-d). Models are set per client in `client.json`, never hard-coded.
- Customer-facing webhooks: `https://ops.<DOMAIN>/in/<client_id>/<channel>` (nuvadesk-core). n8n webhooks: `https://ops.<DOMAIN>/webhook/<client_id>/events`.
- Core code: Node 26 runs `.ts` directly, so use only erasable TypeScript (no enums, no constructor parameter properties) and `.ts` import extensions. `npm run typecheck && npm test` before committing.
- Anything customer-facing goes through `messaging.ts sendToThread` (disclosure, WhatsApp window, transcript). Anything a guard must enforce lives in code, not in the prompt.
- `client.schema.json` changes: run `npm run gen:types` and update `config/clients/*.json`.
- Every step runs locally with `bash scripts/validate.sh`.
- Commit messages: imperative subject, body says *why*.
