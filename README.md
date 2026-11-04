# Nuvadesk — AI front desk for dental & physio clinics

Infrastructure, automation templates and (later) the client dashboard and website for a productized AI-automation agency. A clinic gets a WhatsApp/SMS/web-chat assistant that answers FAQs, books appointments into their calendar, texts back missed calls, qualifies leads and escalates to staff — delivered in 14 days on a fixed price plus a monthly care plan.

- **Spec:** [docs/spec.md](docs/spec.md) — the full business and system document
- **Plan:** [PLAN.md](PLAN.md) — architecture, phases, client.json, accounts, risks
- **Operations:** [RUNBOOK.md](RUNBOOK.md) — deploy, backup, restore in under an hour
- **Rules for Claude Code:** [CLAUDE.md](CLAUDE.md)

## Status
| Phase | Scope | State |
|---|---|---|
| 1 | Control plane: n8n + Postgres, Caddy TLS, Uptime Kuma, backups to B2, Telegram error alerts | Built, not yet run on a server |
| 2 | nuvadesk-core (Packages A and B modules), n8n schedules, `scripts/new-client.ts`, web chat widget, 50-conversation QA | Built. 72 tests and 50/50 mock QA pass. Live QA and the live demo number not done yet (see [PLAN.md §7](PLAN.md#7-phase-2-as-built-2026-11-04)) |
| 3 | Client dashboard (Next.js + Supabase magic links) and agency website + SEO | Not started |

## Quick start (on the VPS)
```bash
sudo bash scripts/hetzner-setup.sh          # once, as root on a fresh Ubuntu 24.04 box
cp infra/.env.example infra/.env && nano infra/.env
make first-boot                              # builds images, starts the stack
# create the n8n owner + API key in the UI, put N8N_API_KEY in infra/.env, then:
make bootstrap                               # Telegram error workflow
```
See [RUNBOOK.md](RUNBOOK.md) for the full procedure (§9 deploys nuvadesk-core, §10 provisions a client).

## Develop locally (no Docker needed)
```bash
npm ci
npm run typecheck && npm test        # 72 unit tests (engine, adapters, server)
npm run qa                           # 50-conversation QA with mock models
npm run qa -- --live                 # same with real Claude models (ANTHROPIC_API_KEY, ~USD 1–3)
node scripts/new-client.ts config/clients/demo-clinic.json   # provisioning dry run
bash scripts/validate.sh             # everything above + compose policy, schema, secret scan
```
