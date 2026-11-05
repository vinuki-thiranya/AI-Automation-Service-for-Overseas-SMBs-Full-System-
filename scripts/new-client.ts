// Provision a client from its client.json (Section 12, Prompt 3/6).
//
//   node scripts/new-client.ts config/clients/<id>.json                      # dry run: checks + plan + URLs
//   node scripts/new-client.ts config/clients/<id>.json --secrets <file> --apply
//
// --secrets: a gitignored JSON file mapping credential refs to values, e.g.
//   { "acme-dental/anthropic": "sk-ant-...", "acme-dental/twilio": { "account_sid": "AC...", "auth_token": "..." } }
// Reads infra/.env when present (SUPABASE_*, CORE_SECRET, DOMAIN, N8N_API_KEY). Idempotent: safe to re-run.
// --dev: provision into the development Supabase project in .env.local (the one the local dashboard uses)
//   instead of SUPABASE_<REGION>_*; only for clients with "status": "demo" (rehearsals and demos).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT, readClientConfigFile, type ClientConfig } from "../core/src/config/index.ts";
import { embedFaq, loadFaqSources } from "../core/src/faq.ts";
import { derivedToken } from "../core/src/ingest/verify.ts";
import { loadLocalEnv } from "../core/src/localenv.ts";
import { OpenAIEmbedder } from "../core/src/llm/openai.ts";
import { SupabaseStore } from "../core/src/store/supabase.ts";
import { TelegramBot } from "../core/src/telegram.ts";
import { requestJson, sha256Hex } from "../core/src/util.ts";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    secrets: { type: "string" },
    apply: { type: "boolean", default: false },
    "skip-faq": { type: "boolean", default: false },
    "skip-n8n": { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
});

loadLocalEnv([".env.local", "infra/.env"]);
const env = (k: string) => process.env[k]?.trim() || "";

const configPath = positionals[0];
if (!configPath) {
  console.error("usage: node scripts/new-client.ts <client.json> [--secrets file] [--apply]");
  process.exit(2);
}

type Finding = { level: "error" | "warn"; msg: string };
const findings: Finding[] = [];
const error = (msg: string) => findings.push({ level: "error", msg });
const warn = (msg: string) => findings.push({ level: "warn", msg });
const step = (msg: string) => console.log(`\x1b[1;34m==>\x1b[0m ${msg}`);

let config: ClientConfig;
try {
  config = readClientConfigFile(path.resolve(configPath));
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}
const id = config.client_id;
const base = env("PUBLIC_BASE_URL") || (env("DOMAIN") ? `https://ops.${env("DOMAIN")}` : "https://ops.<DOMAIN>");

// ------------------------------------------------------------------ static checks
function credentialRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => credentialRefs(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "credential" || k.endsWith("_credential")) && typeof v === "string") out.add(v);
      else credentialRefs(v, out);
    }
  }
  return out;
}
const refs = credentialRefs(config);
for (const ref of refs) if (!ref.startsWith(`${id}/`)) error(`credential ref ${ref} must start with '${id}/' (no shared keys across clients)`);

const placeholders = JSON.stringify(config).match(/REPLACE_WITH_[A-Z0-9_]+/g) ?? [];
if (placeholders.length) (config.status === "demo" ? warn : error)(`placeholders still in config: ${[...new Set(placeholders)].join(", ")}`);

const wa = config.channels.whatsapp;
if (wa?.enabled && !wa.phone_number_id) error("channels.whatsapp.phone_number_id is required");
if (config.channels.sms?.enabled && !config.channels.sms.from_number) error("channels.sms.from_number is required");
if (config.channels.missed_call?.enabled && !config.channels.sms?.enabled) error("missed_call needs the Twilio sms channel (its credential verifies voice webhooks)");
if (config.channels.webchat?.enabled && !config.channels.webchat.allowed_origins?.length) error("channels.webchat.allowed_origins is empty");
if (!config.channels.email?.enabled) warn("email channel disabled: no owner reports or booking confirmations will be sent");

const b = config.booking;
if (b) {
  const needsCalendars = ["google_calendar", "cliniko", "microsoft_bookings"].includes(b.adapter);
  const needsExternal = ["cliniko", "acuity", "microsoft_bookings", "calendly"].includes(b.adapter);
  if (needsCalendars && !b.calendars?.length) error(`booking.calendars is required for ${b.adapter}`);
  if (["cliniko", "microsoft_bookings"].includes(b.adapter) && !b.account_id) error(`booking.account_id is required for ${b.adapter}`);
  if (needsExternal) for (const s of config.business.services.filter((s) => s.bookable_online !== false && !s.external_id)) error(`service ${s.id} needs external_id for ${b.adapter}`);
  if ((b.adapter === "jane" || b.adapter === "link") && !b.booking_link) error(`booking.booking_link is required for ${b.adapter} (link-out mode)`);
  if (b.adapter === "google_calendar" && (!env("GOOGLE_OAUTH_CLIENT_ID") || !env("GOOGLE_OAUTH_CLIENT_SECRET"))) warn("GOOGLE_OAUTH_CLIENT_ID/SECRET not set in infra/.env");
}
const esc = config.escalation;
if (esc.channel === "telegram" && (!esc.telegram_chat_id || !esc.credential)) error("escalation.telegram_chat_id and escalation.credential are required for telegram");
if (esc.channel === "whatsapp_staff" && !wa?.templates?.escalation_alert) warn("no whatsapp template 'escalation_alert': staff alerts fall back to SMS with a claim code");
if (config.crm?.adapter === "google_sheets" && !config.crm.sheet_id) error("crm.sheet_id is required");
if (config.crm?.adapter === "gohighlevel" && !config.crm.account_id) error("crm.account_id (location id) is required");
for (const src of config.business.faq_sources ?? []) {
  if (src.type === "file" && !existsSync(path.resolve(REPO_ROOT, src.ref))) error(`FAQ file not found: ${src.ref}`);
}

// ------------------------------------------------------------------ secrets
let fileSecrets: Record<string, string> = {};
if (args.secrets) {
  const raw = JSON.parse(readFileSync(path.resolve(args.secrets), "utf8")) as Record<string, unknown>;
  fileSecrets = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  for (const k of Object.keys(fileSecrets)) if (!k.startsWith(`${id}/`)) error(`secrets file key ${k} is not for client ${id}`);
}

const region = config.region.toUpperCase();
if (args.dev && config.status !== "demo") {
  console.error(`✗ --dev is only for demo and rehearsal clients ("status": "demo"); ${id} is "${config.status ?? "staging"}"`);
  process.exit(1);
}
const supabaseUrl = args.dev ? env("NEXT_PUBLIC_SUPABASE_URL") : env(`SUPABASE_${region}_URL`);
const supabaseKey = args.dev ? env("SUPABASE_SERVICE_ROLE_KEY") : env(`SUPABASE_${region}_SERVICE_ROLE_KEY`);
const store = supabaseUrl && supabaseKey ? new SupabaseStore(supabaseUrl, supabaseKey) : null;
if (!store) (args.apply ? error : warn)(`SUPABASE_${region}_URL / _SERVICE_ROLE_KEY not set: can't check Vault or provision`);

let vaultRefs = new Set<string>();
if (store) {
  const res = await store.db.rpc("list_client_secret_refs", { p_client_slug: id });
  if (res.error) warn(`could not list Vault secrets: ${res.error.message}`);
  else vaultRefs = new Set(res.data as string[]);
}
const missingRefs = [...refs].filter((r) => !fileSecrets[r] && !vaultRefs.has(r));
if (missingRefs.length) (args.apply && config.status !== "demo" ? error : warn)(`credentials not provided yet: ${missingRefs.join(", ")}`);

const coreSecret = env("CORE_SECRET");
if (!coreSecret || coreSecret === "CHANGE_ME") warn("CORE_SECRET not set: lead-form and WhatsApp verify tokens below are placeholders");
const token = (purpose: "lead" | "wa-verify" | "telegram") => (coreSecret && coreSecret !== "CHANGE_ME" ? derivedToken(coreSecret, purpose, id) : `<${purpose}-token>`);

// ------------------------------------------------------------------ report
console.log(`\nClient: ${config.name} (${id}) · ${config.vertical} · region ${config.region} · status ${config.status ?? "staging"}`);
console.log(`Packages: ${config.packages.join(", ")} · care plan ${config.care_plan} · booking ${b?.adapter ?? "none"} · CRM ${config.crm?.adapter ?? "none"} · escalation ${esc.channel}\n`);
for (const f of findings) console.log(`${f.level === "error" ? "\x1b[31m✗ error\x1b[0m" : "\x1b[33m! warn \x1b[0m"} ${f.msg}`);
if (!findings.length) console.log("✓ no issues found");
const errors = findings.filter((f) => f.level === "error");

if (!args.apply) {
  console.log("\nDry run. With --apply this would: upsert the clients row, store secrets in Vault, embed the FAQ, create the n8n events workflow" +
    (esc.channel === "telegram" ? ", register the Telegram webhook" : "") + ".");
} else if (errors.length) {
  console.error(`\n${errors.length} error(s): fix them before --apply.`);
  process.exit(1);
} else {
  // ---------------------------------------------------------------- apply
  step("upserting clients row");
  const up = await store!.db.from("clients").upsert({
    slug: id, name: config.name, vertical: config.vertical, region: config.region, timezone: config.timezone,
    status: config.status ?? "staging", config,
  }, { onConflict: "slug" }).select("id").single();
  if (up.error) throw new Error(`clients upsert: ${up.error.message}`);
  const clientUuid = (up.data as { id: string }).id;

  for (const [ref, value] of Object.entries(fileSecrets)) {
    const res = await store!.db.rpc("put_client_secret", { p_ref: ref, p_value: value });
    if (res.error) throw new Error(`put_client_secret ${ref}: ${res.error.message}`);
  }
  if (Object.keys(fileSecrets).length) step(`stored ${Object.keys(fileSecrets).length} secret(s) in Vault`);

  if (!args["skip-faq"]) {
    const emb = config.assistant.llm.embeddings;
    const key = fileSecrets[emb.credential] ?? ((await store!.db.rpc("get_client_secret", { p_ref: emb.credential })).data as string | null);
    if (!key) console.log(`  skipped FAQ embedding: ${emb.credential} not available`);
    else {
      const chunks = await loadFaqSources(config);
      const res = await embedFaq(store!, clientUuid, new OpenAIEmbedder(key, emb.model), chunks);
      step(`embedded ${res.chunks} FAQ chunk(s) (${res.usage.reduce((s, u) => s + u.inputTokens, 0)} tokens)`);
    }
  }

  if (!args["skip-n8n"]) await provisionN8n();

  if (esc.channel === "telegram" && esc.credential) {
    const raw = fileSecrets[esc.credential] ?? ((await store!.db.rpc("get_client_secret", { p_ref: esc.credential })).data as string | null);
    if (raw) {
      await new TelegramBot((JSON.parse(raw) as { bot_token: string }).bot_token).setWebhook(`${base}/in/${id}/telegram`, token("telegram"));
      step("registered Telegram webhook");
    }
  }
  step("done");
}

async function provisionN8n() {
  const apiUrl = env("N8N_API_URL") || (env("DOMAIN") ? `https://ops.${env("DOMAIN")}/api/v1` : "");
  const apiKey = env("N8N_API_KEY");
  if (!apiUrl || !apiKey) {
    console.log("  skipped n8n: N8N_API_URL/N8N_API_KEY not set");
    return;
  }
  const api = <T>(method: string, p: string, json?: unknown) =>
    requestJson<T>(fetch, `${apiUrl}${p}`, { method, json, headers: { "X-N8N-API-KEY": apiKey } });
  const all: { id: string; name: string; nodes?: { credentials?: { httpHeaderAuth?: { id: string } } }[] }[] = [];
  let cursor = "";
  do {
    const page = await api<{ data: typeof all; nextCursor?: string | null }>("GET", `/workflows?limit=100${cursor ? `&cursor=${cursor}` : ""}`);
    all.push(...page.data);
    cursor = page.nextCursor ?? "";
  } while (cursor);
  const errorWf = all.find((w) => w.name === "System — Error → Telegram");
  const scheduler = all.find((w) => w.name.startsWith("System — Core scheduler"));
  const credId = scheduler?.nodes?.map((n) => n.credentials?.httpHeaderAuth?.id).find(Boolean);
  if (!errorWf || !credId) {
    console.log("  skipped n8n: run `make bootstrap` first (error workflow / core-jobs credential not found)");
    return;
  }
  const h = sha256Hex(`webhook:${id}`);
  const webhookId = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const body = JSON.parse(readFileSync(path.join(REPO_ROOT, "n8n/templates/packages/client-events.json"), "utf8")
    .replaceAll("__CLIENT_ID__", id).replaceAll("__WEBHOOK_ID__", webhookId)
    .replaceAll("__CORE_JOBS_CREDENTIAL_ID__", credId).replaceAll("__ERROR_WORKFLOW_ID__", errorWf.id));
  const existing = all.find((w) => w.name === body.name);
  const wf = existing
    ? await api<{ id: string }>("PUT", `/workflows/${existing.id}`, body)
    : await api<{ id: string }>("POST", "/workflows", body);
  await api("POST", `/workflows/${wf.id}/activate`);
  const tagName = `client:${id}`;
  const tags = await api<{ data: { id: string; name: string }[] }>("GET", "/tags?limit=250");
  const tag = tags.data.find((t) => t.name === tagName) ?? await api<{ id: string; name: string }>("POST", "/tags", { name: tagName });
  await api("PUT", `/workflows/${wf.id}/tags`, [{ id: tag.id }]);
  step(`n8n workflow '${body.name}' ${existing ? "updated" : "created"} and tagged ${tagName}`);
}

// ------------------------------------------------------------------ what to configure where
const lines = [
  "",
  "Configure these endpoints:",
  wa?.enabled && `  WhatsApp (Meta app → WhatsApp → Configuration): callback ${base}/in/${id}/whatsapp · verify token ${token("wa-verify")} · subscribe to 'messages'`,
  config.channels.sms?.enabled && `  Twilio number ${config.channels.sms.from_number} → Messaging webhook (POST): ${base}/in/${id}/sms`,
  config.channels.missed_call?.enabled && `  Twilio number → Voice webhook (POST): ${base}/in/${id}/voice · clinic phone: conditional forward (no answer/busy) to ${config.channels.sms?.from_number ?? "the Twilio number"}`,
  config.channels.webchat?.enabled && `  Web chat snippet: <script src="${base}/widget.js" data-client="${id}" async></script>`,
  config.lead_qualification && `  Lead forms / Zapier (POST JSON or form): ${base}/in/${id}/lead?token=${token("lead")}  fields: name, phone, email, source, consent_marketing`,
  `  Uptime Kuma: HTTP keyword monitor ${base}/in/${id}/health (keyword "ok")`,
  wa?.templates && Object.keys(wa.templates).length && `  Meta templates to submit (category UTILITY unless marketing): ${Object.values(wa.templates).join(", ")}`,
].filter(Boolean);
console.log(lines.join("\n"));
process.exit(errors.length && args.apply ? 1 : 0);
