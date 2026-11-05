# Prompt 6 rehearsal: Bayside Family Dental (fictional)

Phase 4.4 (PLAN §11), run on 2026-11-05. A full per-client build on a made-up clinic, using only the delivery documents and scripts, to find what breaks before a real client depends on it. No real numbers, keys or calendars were used, so steps that need them stop at the "configure these endpoints" stage.

**The clinic:** Bayside Family Dental, Wynnum (Brisbane), Package A only, Keep-alive care plan. Brisbane has no daylight saving, unlike the Sydney demo clinic, which tests the timezone handling.

## What was done, in the order of Prompt 6

| Step | Document or script | Result |
|---|---|---|
| Intake | [`intake.md`](../intake.md) | The answers became [`config/clients/rehearsal-dental.json`](../../../config/clients/rehearsal-dental.json) and its [FAQ](../../../config/clients/rehearsal-dental.faq.md). It validates against the schema. |
| Scope check | [`bayside-requirements.txt`](bayside-requirements.txt) → `node scripts/scope-check.ts config/clients/rehearsal-dental.json docs/delivery/rehearsal/bayside-requirements.txt` | 6 of 11 requests in scope. Flagged: the phone agent (voice add-on, + USD 1,000), a second location, leads into HubSpot (Package B), card deposits, and a website redesign (never included). |
| Change request | [`change-request.md`](../change-request.md) | Drafted for the voice add-on (below). |
| Provision | `node scripts/new-client.ts config/clients/rehearsal-dental.json --dev --apply --skip-faq --skip-n8n` | The client row is in the development Supabase project, and the agency dashboard lists it. FAQ embedding and n8n were skipped: they need an OpenAI key and the VPS. The dry run lists every endpoint and the 6 Meta templates to submit. |
| QA | `npm run qa -- --config config/clients/rehearsal-dental.json` | **46/46 passed** on mock models. The 4 lead cases were skipped because the clinic has no Package B. Live QA waits for the pre-launch gate (PLAN §12). |
| UAT | [`uat-checklist.md`](../uat-checklist.md) | Ready to send. Every line needs the test number, which needs a WhatsApp/Twilio number (PLAN §12.6). |
| Training | [`training-outline.md`](../training-outline.md) | Quick guide filled in for Bayside (below). |
| Go-live | [`go-live-checklist.md`](../go-live-checklist.md) | Blocked, as expected, by the placeholders the dry run lists: Meta phone number id, two calendar ids, credentials. |

## What the rehearsal found and fixed

1. **The 50 test conversations were written for Harbourside, not for dental clinics.** Prices ($220), the street, the car park, opening hours, the new-patient cutoff, the emergency line and the clinic name were all hard-coded, so a correct new clinic would have failed. They're now tokens filled from each client's `client.json` (`{{price:check-up-clean}}`, `{{hours:sat}}`, … in `qa/run.ts`). The demo clinic still scores 50/50.
2. **Cases for packages a client hasn't bought counted as failures.** Lead cases are now tagged `packages: [B]` and skipped for Package A clients; the pass mark counts only the cases that apply.
3. **A paused client still replied to patients.** The go-live rollback relies on pausing a client, but nothing checked `status: "paused"`. Now messages are recorded and nothing is sent, with a test (`core/test/conversation.test.ts`).
4. **There was no safe way to provision a rehearsal or demo into the development database.** `new-client.ts --dev` now does that, and only for `"status": "demo"` clients.
5. **Physio has no test set yet.** Running the dental cases on the physio demo now fails loudly ("no priced service check-up-clean"). A physio set of 50 is needed before the first physio client: a Phase 5 item.

## Change request drafted from the scope check

> **Change request 1: AI phone agent**
> Clinic: Bayside Family Dental · Requested by: practice manager
>
> **What you asked for:** "An AI that answers the phone when we're busy with patients."
> **Why it's outside the current scope:** Package A answers WhatsApp, SMS and website chat, and texts back missed calls. Answering the call itself is the voice add-on.
> **What we'll do:** an AI phone agent on your number that answers when the front desk doesn't pick up, books into your calendars, and transfers to the front desk on request.
> **What it costs and how long it takes:** USD 1,000 setup, plus call minutes at cost + 20% within your usage cap. Ready 7 business days after approval, billed 50% now, 50% on delivery.
> **What doesn't change:** chat, SMS and missed-call text-back keep working while we add it.
>
> To approve, reply "approved" to this message.

## Quick guide, filled in for Bayside

**Bayside Family Dental front desk: how the assistant works**

- **It answers** WhatsApp, SMS and website chat, any time, from your price list, hours and policies. It introduces itself as Mia, your virtual assistant.
- **It books** into Dr Rossi's and Dr Okafor's calendars, only into free times, and sends reminders 24 hours and 2 hours before.
- **It hands over** when a patient asks for a person, when it isn't sure, or when something fails. Priya and the front-desk phone get a WhatsApp card: tap **I'll take it**, then reply as normal. It stays quiet in that conversation for 2 hours.
- **Nobody took it?** After 10 minutes, the owner is alerted.
- **Missed a call?** The caller gets a text within a minute offering to help by message.
- **See everything** in the dashboard. Press `?` there for shortcuts.
- **Something wrong or changed?** Message us in your support channel. We reply within 24 hours on the Keep-alive plan.
