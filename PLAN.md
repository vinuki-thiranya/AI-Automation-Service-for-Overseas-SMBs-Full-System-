# PLAN — Recallo control plane, template library, dashboard and site

This is the answer to **Prompt 1** in [docs/spec.md §12](docs/spec.md#12-claude-code-prompts-plan-build-in-phases-design-seo). It confirms the architecture, splits the work into three phases, defines `client.json` and the isolation model, lists every account and credential, and ranks the 15 riskiest decisions. Rules for day-to-day work are in [CLAUDE.md](CLAUDE.md).

**Brand.** *Recallo — AI front desk for dental & physio clinics.* "Recall" is the dental word for bringing patients back, and the product's promise is that no call is missed. The domain is one variable (`DOMAIN` in `infra/.env`). `recallo.ai` is the working default, but its availability **has not been checked**; confirm it, or pick an alternative, before buying.

---

## 1. Architecture (confirmed against spec §5)

![System architecture](docs/architecture.png)

| Layer | Decision | Notes |
|---|---|---|
| Compute | Hetzner CX22 (2 vCPU / 4 GB), Ubuntu 24.04, Docker Compose | Falkenstein for EU/UK. Ashburn when the first US client signs. Upgrade to CX32 at 10+ clients. |
| Workflow engine | n8n **2.46.4** (current `stable`), Postgres-backed | Postgres **17.11** stores n8n's data only. Client data lives in Supabase. |
| TLS / ingress | Caddy **2.11.7** with the `caddy-dns/cloudflare` plugin (DNS-01) | Certificates issue and renew behind the Cloudflare proxy. Only ports 80 and 443 are open. |
| Monitoring | Uptime Kuma **2.5.9** at `status.<DOMAIN>`, n8n error workflow → Telegram, Sentry (Phase 3 web apps) | |
| Backups | Custom `backup` container: nightly `pg_dump` → Backblaze B2, nightly workflow export → Git | Restore drill in RUNBOOK.md, target under 1 hour. |
| Client data + vectors | Supabase (Postgres + pgvector + Auth + Vault) | One project to start. Add one per region (US / EU / AU) when the first client in that region signs. |
| LLM | Claude Sonnet 5.5 for conversation, Claude Haiku 5.5 for guardrails and classification, OpenAI as outage fallback | Per-client keys with spend caps. Models are named in `client.json`. |
| Embeddings | OpenAI `text-embedding-3-small` (1536-d) | Anthropic has no embeddings endpoint. |
| Messaging | WhatsApp Business Cloud API (Meta), Twilio SMS and voice webhooks, Resend for email | Official APIs only. |
| Dashboard | Next.js on Vercel + Supabase Auth magic links | Phase 3 |
| Website | Claude Design handoff → Next.js on Vercel | Phase 3 |

**Request flow.**
1. A webhook arrives at `ops.<DOMAIN>/webhook/<client_id>/<channel>`.
2. n8n verifies the signature, normalizes the message to `{channel, contact_id, text, attachments, timestamp, metadata}`, dedupes on the provider message ID, resolves or merges the contact, and loads the thread from Supabase.
3. The guardrail classifier (Haiku) runs.
4. Retrieval fetches the top 5 FAQ chunks, then Sonnet runs with tools.
5. n8n executes any tool calls (booking, CRM, escalation).
6. The reply goes out on the same channel; the transcript, metrics and usage are written.
7. Escalations go to the staff group. Errors go to Telegram.

---

## 2. Phases

### Phase 1 — Control plane (this commit)
**Deliverables**
- `infra/docker-compose.yml`: postgres, n8n, caddy, uptime-kuma, backup.
- `Makefile` and the scripts first-boot, update, backup, restore, hetzner-setup and n8n-bootstrap.
- `RUNBOOK.md`.
- The Telegram error workflow.
- The Supabase base migration.
- `client.schema.json` and the demo clinic config.

**Exit criteria**
- `ops.` and `status.` serve valid TLS.
- A forced workflow error reaches Telegram within a minute.
- The nightly dump lands in B2 and the workflow export lands in Git.
- A timed restore onto a fresh VPS finishes in under 1 hour.

### Phase 2 — Template library, Packages A and B (spec §3, §4.1–4.9)
| Module | Template(s) | Package |
|---|---|---|
| 4.1 Channel ingestion | `ingest-whatsapp`, `ingest-twilio-sms`, `ingest-webchat`, `missed-call` (+ webchat widget JS) | A, B |
| 4.2 Conversation engine | `conversation-engine` (guardrail → retrieve → LLM + tools → reply), `faq-embed` | A, B |
| 4.3 Booking | adapter sub-workflows: Google Calendar, Microsoft Bookings, Calendly, Cliniko, Jane, Acuity; `reminders` (24h/2h), `no-show` | A |
| 4.4 Lead qualification | `lead-intake`, `lead-score`, `nurture-14d`, speed-to-lead metric | B |
| 4.5 CRM sync | HubSpot, Pipedrive, GoHighLevel, Google Sheets, all idempotent on external ID | A, B |
| 4.6 Document capture | deferred (Package C) | — |
| 4.7 Reviews | deferred (Package C) | — |
| 4.8 Reporting | `metrics-rollup` (nightly → `metrics_daily`), `weekly-owner-report` | A, B |
| 4.9 Escalation | `escalate` (staff WhatsApp card + "I'll take it"), `staff-relay`, 2-hour AI pause | A, B |

Plus:
- `scripts/new-client.ts`: validates `client.json`, inserts Supabase rows, creates the n8n project and credentials, copies templates, and prints webhook URLs.
- `qa/`: the 50-conversation QA suite as a runnable test.
- `config/clients/demo-clinic.json` wired to a public demo number.

**Exit criteria**
- The demo clinic books a real Google Calendar slot over WhatsApp.
- The QA suite passes at least 48 of 50.
- p95 response time is under 10 s.

### Phase 3 — Client dashboard and agency website (Prompts 4–5)
- **Dashboard:** magic-link auth; agency / owner / staff roles; metrics over time; transcript search; the approval queue (Package D); invoices and the walkthrough video.
- **Website:** Claude Design handoff; package, vertical and case-study pages; demo number; Cal.com; MDX blog; JSON-LD, sitemap, hreflang (en-AU / en-GB / en-US); Lighthouse mobile 95+.

**Exit criteria**
- Screenshots reviewed.
- Lighthouse 95+.
- An RLS test shows staff of client A cannot read client B.

---

## 3. `client.json` and the isolation model

**Schema.** [config/client.schema.json](config/client.schema.json) (JSON Schema 2020-12). Example: [config/clients/demo-clinic.json](config/clients/demo-clinic.json). Every behaviour that differs between clients lives in this file, so a new client means a new file plus credentials, not code.

| Block | Holds |
|---|---|
| identity | `client_id` (slug), `name`, `vertical`, `region` (us/eu/au), `timezone`, `locale`, `packages`, `care_plan` |
| `business` | address, phone, website, hours per weekday, holidays, services with prices and durations, policies (cancellation, payment, insurance), staff bios |
| `channels` | WhatsApp (phone ID, credential ref), SMS (Twilio number, sub-account credential ref), web chat (allowed origins), missed-call (provider, text-back delay) |
| `assistant` | persona name, tone, disclosure text, languages, forbidden topics, after-hours mode, emergency text, confidence threshold, `llm` (primary / classifier / fallback model + credential ref + monthly cap) |
| `booking` | adapter + credential ref, calendars, buffer minutes, new-patient cutoff, reminder offsets, no-show follow-up delay |
| `lead_qualification` | questions (id, text, type, options, weight), thresholds for hot/warm, nurture sequence |
| `crm` | adapter + credential ref, field mapping, source-of-truth rules |
| `escalation` | staff group (WhatsApp/Slack/Telegram), contacts, AI pause minutes (120) |
| `reporting` | owner recipients, weekly day and time, revenue per booking for the "revenue influenced" estimate |
| `compliance` | country regime (TCPA / Spam Act / PECR), consent text, STOP keywords, retention months (12), PHI-minimization flag |

**Credential references.** Secrets are never stored in `client.json`. Fields named `credential` hold a reference `<client_id>/<name>`. That reference is the name of an n8n credential (or a Supabase Vault secret) in the client's own n8n project.

**Isolation model.**
| Layer | Isolation |
|---|---|
| n8n | One **project** per client holds its workflows and credentials. Partner-plan or large clients get their own n8n container (~300 MB RAM) on the same box. |
| Supabase | One shared schema. **`client_id` on every table, RLS on every table.** n8n writes with the service role. Dashboard users read through RLS, keyed on `user_roles` (agency / owner / staff). This is spec §11's wording, and it keeps the dashboard to one query path. Data residency comes from the region's Supabase project. |
| Secrets | n8n credential store (encrypted with `N8N_ENCRYPTION_KEY`) plus Supabase Vault. One set per client, nothing shared. |
| Messaging | WhatsApp number per client, Twilio sub-account per client. |
| LLM | Anthropic: a **workspace per client** with a workspace spend limit, and a key in that workspace. OpenAI: a **project per client** with a budget. Usage is logged to `usage_events` for pass-through billing. |
| Webhooks | Path-scoped per client and signature-verified per provider. |

---

## 4. Accounts and credentials to create

| Account | Credential | Scope / setting | Stored in |
|---|---|---|---|
| GitHub | Deploy key (ed25519) on this repo | **Write** (the backup container pushes workflow exports). Repo stays private. | VPS `infra/secrets/deploy_key`, never committed |
| Hetzner Cloud | Console login + SSH key | Project "recallo". SSH key auth only. | Your password manager |
| Cloudflare | API token | `Zone:DNS:Edit` on the one zone only (Caddy DNS-01) | `infra/.env` `CLOUDFLARE_API_TOKEN` |
| Backblaze B2 | Application key | Restricted to bucket `recallo-backups`, read+write, no list-all-buckets | `infra/.env` `B2_*` |
| Telegram | Bot token (BotFather) + chat ID of your alerts chat | Bot only posts | `infra/.env` → n8n credential |
| n8n | Owner account + public API key | API key for bootstrap and workflow export | `infra/.env` `N8N_API_KEY` |
| Supabase | Project per region: `service_role` key (n8n only), `anon` key (dashboard), DB connection string (backups) | Service role never leaves the server | n8n credential / Vercel env / `infra/.env` |
| Anthropic | Org + **one workspace per client** with a monthly spend limit, plus one key per workspace. A separate "agency-demo" workspace for demos. | Key per client | n8n credential `<client_id>/anthropic` |
| OpenAI | One project per client with a monthly budget and a project key (fallback + embeddings) | Project-scoped key | n8n credential `<client_id>/openai` |
| Twilio | Main account + **sub-account per client**, a number per client | Sub-account SID + auth token. Webhook signature validation uses the sub-account token. | n8n credential `<client_id>/twilio` |
| Meta Business | Business Manager, WhatsApp Business Account per client, **system user** token | `whatsapp_business_messaging`, `whatsapp_business_management`. App secret for `X-Hub-Signature-256`. | n8n credential `<client_id>/whatsapp` |
| Resend | Domain-verified sending key | Send-only, per sending domain | n8n credential |
| Google Cloud | OAuth client for Calendar/Sheets (per client consent) | `calendar.events`, `spreadsheets` only | n8n credential `<client_id>/google` |
| Sentry | Org + project per web app | DSN only | Vercel env (Phase 3) |
| Vercel | Team + projects (dashboard, site) | Git integration | Vercel |
| Cal.com, PayPal Business, Payoneer, Wise | Sales and finance accounts | — | Password manager |

---

## 5. The 15 riskiest decisions

| # | Risk | Decision / mitigation |
|---|---|---|
| 1 | **Prompt injection** (customer text steers the LLM into leaking the prompt, promising discounts, or calling tools wrongly) | A Haiku guardrail classifier runs *before* the main call. Customer text is passed only as user content, never concatenated into the system prompt. Tools validate every argument server-side (n8n), e.g. only slots that `check_availability` actually returned can be booked. No tool can send to an arbitrary number. |
| 2 | **Escalation reliability** (a human never sees the handover) | The escalation card goes to the staff group *and* writes an `escalations` row. If no one claims it within 10 minutes, a second ping goes to the owner. Unclaimed escalations appear in the daily digest. The customer always gets an honest "a team member will reply" message. |
| 3 | **Webhook authenticity** | Verify Meta `X-Hub-Signature-256` (app secret), Twilio `X-Twilio-Signature` (sub-account token), and an HMAC on the web-chat widget. Reject unsigned requests before any processing. |
| 4 | **PII / PHI minimization for clinics** | Store name, phone, email and appointment time. The assistant is instructed not to ask about symptoms. US clinics set `phi_minimization: true`, which also redacts free-text health details before storage. Transcripts are purged after 12 months. |
| 5 | **TCPA / Spam Act / PECR consent** | Transactional messages (confirmations, reminders) are allowed. Marketing and nurture messages require `contacts.consent_marketing_at`. STOP / UNSUBSCRIBE / CANCEL are honoured on every channel, write `opted_out_at`, and block further sends. |
| 6 | **WhatsApp 24-hour window** | Free-form replies only inside the window. Outbound reminders and nurture use pre-approved templates. Submit templates at client kickoff, because approval can take days. |
| 7 | **AI disclosure** | The first message in every thread includes `assistant.disclosure_text`. This is enforced in the workflow, not left to the model. |
| 8 | **LLM outage / price change** | Anthropic primary, OpenAI fallback configured per client. If both fail, the customer gets a fixed "we'll call you back" message and an escalation is created. More than 3 failures in an hour sends a Telegram alert. |
| 9 | **Runaway spend** (loops, abuse) | Provider-side caps (Anthropic workspace limit, OpenAI project budget, Twilio sub-account limits). An app-side monthly cap is checked against `usage_events`. Per-contact rate limit of about 30 messages per hour. |
| 10 | **Double booking / duplicate writes** | Dedupe inbound on provider message ID. Booking writes are idempotent on `(client_id, adapter, external_booking_id)`. Availability is re-checked immediately before writing. CRM writes are keyed on the external contact ID. |
| 11 | **Hallucinated prices or medical/legal advice** | Prices come only from `business.services`, injected into the prompt. Forbidden-topics list. Retrieval-grounded answers. Below the confidence threshold the assistant escalates instead of guessing. The QA suite includes adversarial cases. |
| 12 | **Data residency** | One Supabase project per region, created when the first client there signs. `client.region` selects the project. The n8n VPS holds only transient execution data, with execution pruning on. |
| 13 | **Backup / restore actually works** | Nightly dumps to B2 with 30-day retention. Workflows also go to Git. A timed restore drill before the first client, then quarterly, recorded in RUNBOOK.md. |
| 14 | **Secrets leaking into Git or logs** | `.gitignore` blocks env files and keys. `client.json` holds references only. Pinned data (`pinData`) is stripped from workflow exports. Pre-commit review of `git diff --cached`. n8n blocks `$env` access in nodes. |
| 15 | **Single VPS = single point of failure** | Uptime Kuma checks every minute. The restore-in-1-hour runbook is drilled. Spec §4's 99.5% target allows about 3.6 hours a month. Revisit a warm standby at 10+ clients. |

---

## 6. Open questions (please answer before Phase 2)
1. **Domain:** is `recallo.ai` (or `recallo.com.au` / `getrecallo.com`) available and acceptable, or do you want a different brand?
2. **First Supabase region:** AU (Sydney), since the first vertical is Australian clinics? I recommend creating the first project in `ap-southeast-2`.
3. **First booking adapter to build deeply:** Cliniko (most common in AU allied health) or Google Calendar (fastest for demos)? I recommend Google Calendar for the demo and Cliniko second.
4. **OpenAI fallback model:** confirm which OpenAI chat model you want as fallback. The demo config says `gpt-5-mini`; verify that ID against your OpenAI account before Phase 2.
5. **Telegram:** create the bot and alerts chat now so the Phase 1 error workflow can be tested.
