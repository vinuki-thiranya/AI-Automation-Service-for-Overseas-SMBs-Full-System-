// Live provider checks with the real adapters and the credentials in .env.local (gitignored).
//   node scripts/check-integrations.ts            # read-only probes
//   node scripts/check-integrations.ts --write    # also create-then-delete probes (test event, sheet row, Telegram message)
//   node scripts/check-integrations.ts --only google-calendar,openai
// Providers without credentials are reported as skipped. Secrets are never printed.
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { DateTime } from "luxon";
import { GoogleCalendarAdapter, GoogleTokenSource } from "../core/src/booking/google-calendar.ts";
import { REPO_ROOT, readClientConfigFile } from "../core/src/config/index.ts";
import { GoogleSheetsCrm } from "../core/src/crm/adapters.ts";
import { AnthropicClassifier } from "../core/src/llm/anthropic.ts";
import { OpenAIConversation, OpenAIEmbedder } from "../core/src/llm/openai.ts";
import type { TurnContext } from "../core/src/llm/types.ts";
import { loadLocalEnv, mask } from "../core/src/localenv.ts";
import { HttpError, basicAuth, errorMessage, requestJson } from "../core/src/util.ts";

const { values: args } = parseArgs({ options: { write: { type: "boolean", default: false }, only: { type: "string" } } });
const loaded = loadLocalEnv();
const env = (k: string) => process.env[k]?.trim() ?? "";
const only = args.only?.split(",").map((s) => s.trim());

type Status = "pass" | "fail" | "skip";
const results: { name: string; status: Status; ms: number; detail: string }[] = [];

async function check(name: string, needs: string[], fn: () => Promise<string>): Promise<void> {
  if (only && !only.includes(name)) return;
  const missing = needs.filter((k) => !env(k));
  if (missing.length) {
    results.push({ name, status: "skip", ms: 0, detail: `not configured (${missing.join(", ")})` });
    return;
  }
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: "pass", ms: Date.now() - started, detail });
  } catch (err) {
    const detail = err instanceof HttpError ? `${err.message}: ${err.body.slice(0, 200)}` : errorMessage(err).slice(0, 300);
    results.push({ name, status: "fail", ms: Date.now() - started, detail });
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const demo = readClientConfigFile(`${REPO_ROOT}/config/clients/demo-clinic.json`);
const google = () => new GoogleTokenSource({ clientId: env("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET"), refreshToken: env("GOOGLE_REFRESH_TOKEN") }, fetch);

// ------------------------------------------------------------------ models
await check("anthropic", ["ANTHROPIC_API_KEY"], async () => {
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  for (const id of [demo.assistant.llm.primary.model, demo.assistant.llm.classifier.model]) await client.models.retrieve(id);
  const g = await new AnthropicClassifier(env("ANTHROPIC_API_KEY"), demo.assistant.llm.classifier.model)
    .guardrail({ text: "Hi, can I book a check-up for Thursday?", recent: [], business: "Test dental clinic" });
  assert(g.verdict.category === "ok", `guardrail returned ${g.verdict.category}`);
  return `models ${demo.assistant.llm.primary.model} + ${demo.assistant.llm.classifier.model} available; guardrail ok (${g.usage[0]?.inputTokens ?? 0} tokens) · key ${mask(env("ANTHROPIC_API_KEY"))}`;
});

await check("openai", ["OPENAI_API_KEY"], async () => {
  const key = env("OPENAI_API_KEY");
  const client = new OpenAI({ apiKey: key });
  for (const id of ["gpt-6-luna", "text-embedding-3-small"]) await client.models.retrieve(id);
  const called: unknown[] = [];
  const res = await new OpenAIConversation(key, "gpt-6-luna", "low").run({
    system: "You are a clinic front-desk assistant. Use tools to answer.",
    history: [{ role: "user", text: "What time is it at the clinic?" }],
    context: { note: "Use get_clinic_time to answer time questions." } as TurnContext,
    tools: [{ name: "get_clinic_time", description: "Current local time at the clinic", input_schema: { type: "object", properties: {}, required: [] } }],
    executeTool: async (name, input) => { called.push({ name, input }); return { content: JSON.stringify({ ok: true, time: "10:30am" }) }; },
    maxIterations: 3,
  });
  assert(called.length >= 1, "gpt-6-luna did not call the tool");
  assert(res.text.length > 0, "gpt-6-luna returned no text after the tool result");
  const emb = await new OpenAIEmbedder(key, "text-embedding-3-small").embed(["Do you take new patients?"]);
  assert(emb.vectors[0]?.length === 1536, `embedding has ${emb.vectors[0]?.length} dims, expected 1536`);
  const cost = [...res.usage, ...emb.usage].reduce((s, u) => s + u.costUsd, 0);
  return `gpt-6-luna tool call + answer ok; embeddings 1536-d; ≈ $${cost.toFixed(5)} · key ${mask(key)}`;
});

// ------------------------------------------------------------------ Google
await check("google-calendar", ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "TEST_CALENDAR_ID"], async () => {
  const config = structuredClone(demo);
  config.booking = { ...config.booking!, calendars: [{ id: env("TEST_CALENDAR_ID"), practitioner: "Test calendar" }] };
  const adapter = new GoogleCalendarAdapter(config, google(), fetch);
  const service = config.business.services[0]!;
  const from = DateTime.now().setZone(config.timezone).plus({ days: 1 }).startOf("day");
  const slots = await adapter.findCandidates({ service, from, to: from.plus({ days: 3 }) });
  assert(slots.length > 0, "free/busy returned no open slots in the next 3 business days");
  if (!args.write) return `freeBusy ok: ${slots.length} open ${service.duration_minutes}-min slots in 3 days (read-only)`;

  const key = `integration-check-${Date.now()}`;
  const slot = slots[0]!;
  const first = await adapter.book({ slot, service, patient: { name: "Integration Check", phone: null, email: null, isNew: false }, notes: "Automated check, deleted immediately.", idempotencyKey: key });
  const again = await adapter.book({ slot, service, patient: { name: "Integration Check", phone: null, email: null, isNew: false }, notes: "", idempotencyKey: key });
  assert(first.externalId === again.externalId, "retrying the same booking produced a different event (not idempotent)");
  const after = await adapter.findCandidates({ service, from: slot.start.minus({ minutes: 1 }), to: slot.end.plus({ minutes: 1 }) });
  assert(!after.some((c) => c.start.toMillis() === slot.start.toMillis()), "booked slot still shows as free");
  await adapter.cancel(first.externalId);
  const [calendarId, eventId] = first.externalId.split("|") as [string, string];
  const gone = await requestJson<{ status?: string }>(fetch, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    headers: { Authorization: `Bearer ${await google().get()}` },
  }).catch((err) => (err instanceof HttpError && (err.status === 404 || err.status === 410) ? { status: "cancelled" } : Promise.reject(err)));
  assert(gone.status === "cancelled", `test event not deleted (status ${gone.status})`);
  return `book ${slot.start.toFormat("ccc d LLL HH:mm")} → idempotent retry → slot now busy → deleted`;
});

await check("google-sheets", ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "TEST_SHEET_ID"], async () => {
  const tokens = google();
  const sheetId = env("TEST_SHEET_ID");
  const meta = await requestJson<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(fetch,
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`, { headers: { Authorization: `Bearer ${await tokens.get()}` } });
  if (!args.write) return `spreadsheet "${meta.properties.title}" readable (read-only)`;
  if (!meta.sheets.some((s) => s.properties.title === "QA")) {
    await requestJson(fetch, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: "POST", headers: { Authorization: `Bearer ${await tokens.get()}` }, json: { requests: [{ addSheet: { properties: { title: "QA" } } }] },
    });
  }
  const crm = new GoogleSheetsCrm(tokens, sheetId, "QA", { name: "Name", phone: "Phone", email: "Email", lead_grade: "Grade" }, fetch);
  const contact = { name: "Integration Check", phone: "+61400000999", email: null, externalId: null };
  const a = await crm.upsertContact(contact, { lead_grade: "warm" });
  const b = await crm.upsertContact(contact, { lead_grade: "hot" });
  assert(a.externalId === b.externalId, `second upsert wrote row ${b.externalId}, first wrote ${a.externalId} (duplicate)`);
  return `upsert row ${a.externalId} on tab QA, re-upsert updated the same row (left in place for inspection)`;
});

// ------------------------------------------------------------------ messaging + practice systems
await check("telegram", ["TELEGRAM_BOT_TOKEN"], async () => {
  const me = await requestJson<{ result: { username: string } }>(fetch, `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/getMe`);
  if (args.write && env("TELEGRAM_CHAT_ID")) {
    await requestJson(fetch, `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
      method: "POST", json: { chat_id: env("TELEGRAM_CHAT_ID"), text: "✅ Nuvadesk integration check: alerts reach this chat." },
    });
    return `bot @${me.result.username}; test message sent to chat ${mask(env("TELEGRAM_CHAT_ID"))}`;
  }
  return `bot @${me.result.username} ok${env("TELEGRAM_CHAT_ID") ? "" : " (set TELEGRAM_CHAT_ID to test sending)"}`;
});

await check("twilio", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"], async () => {
  const sid = env("TWILIO_ACCOUNT_SID");
  const acct = await requestJson<{ status: string; type: string }>(fetch, `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: basicAuth(sid, env("TWILIO_AUTH_TOKEN")) } });
  return `account ${mask(sid)} ${acct.status} (${acct.type})`;
});

await check("whatsapp", ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"], async () => {
  const n = await requestJson<{ display_phone_number: string; verified_name: string; quality_rating?: string }>(fetch,
    `https://graph.facebook.com/${env("WHATSAPP_GRAPH_VERSION") || "v26.0"}/${env("WHATSAPP_PHONE_NUMBER_ID")}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}` } });
  return `${n.verified_name} ${n.display_phone_number} quality ${n.quality_rating ?? "n/a"}`;
});

await check("resend", ["RESEND_API_KEY"], async () => {
  const d = await requestJson<{ data: { name: string; status: string }[] }>(fetch, "https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` } });
  return d.data.length ? d.data.map((x) => `${x.name} (${x.status})`).join(", ") : "key ok, no sending domains yet";
});

await check("cliniko", ["CLINIKO_API_KEY"], async () => {
  const key = env("CLINIKO_API_KEY");
  const shard = key.split("-").at(-1);
  const res = await requestJson<{ businesses: { id: string; business_name: string }[] }>(fetch, `https://api.${shard}.cliniko.com/v1/businesses`, {
    headers: { Authorization: basicAuth(key, ""), "User-Agent": `Nuvadesk (${env("OPS_EMAIL") || "ops@nuvadesk.ai"})` },
  });
  return `${res.businesses.length} business(es): ${res.businesses.map((b) => `${b.business_name} [${b.id}]`).join(", ")}`;
});

// ------------------------------------------------------------------ report
const icon: Record<Status, string> = { pass: "\x1b[32m✓ pass\x1b[0m", fail: "\x1b[31m✗ fail\x1b[0m", skip: "\x1b[90m- skip\x1b[0m" };
console.log(`\nIntegration checks (${args.write ? "read + write" : "read-only"}; env from ${loaded.join(", ") || "process environment only"})\n`);
for (const r of results) console.log(`${icon[r.status]}  ${r.name.padEnd(16)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
const failed = results.filter((r) => r.status === "fail").length;
console.log(`\n${results.filter((r) => r.status === "pass").length} passed, ${failed} failed, ${results.filter((r) => r.status === "skip").length} skipped`);
process.exit(failed ? 1 : 0);
