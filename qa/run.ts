// The 50-conversation QA suite (spec §6.6, CLAUDE.md rule 5). Run before any prompt, tool or guardrail change.
//
//   npm run qa                         # mock models: free, deterministic, runs anywhere
//   npm run qa -- --live               # real models (ANTHROPIC_API_KEY; OPENAI_API_KEY optional for retrieval)
//   npm run qa -- --only booking       # filter by id substring
//   npm run qa -- --live --model openai:gpt-6-luna   # swap the conversation model (fallback evaluation)
//
// Everything except the model runs in memory: fake calendar, captured messages, no real sends.
// `expect` is checked in both modes, `expect_mock` only with mock models, `rubric` only live (Claude judge).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DateTime } from "luxon";
import YAML from "yaml";
import { z } from "zod";
import { readClientConfigFile, type ClientConfig } from "../core/src/config/index.ts";
import { unknownPrices } from "../core/src/engine/conversation.ts";
import { handleLeadIntake, handleMissedCall, type LeadIntake } from "../core/src/ingest/handlers.ts";
import { runTick } from "../core/src/jobs.ts";
import { AnthropicClassifier, AnthropicConversation } from "../core/src/llm/anthropic.ts";
import type { ModelFactory } from "../core/src/llm/factory.ts";
import { MockEmbedder } from "../core/src/llm/mock.ts";
import { OpenAIConversation, OpenAIEmbedder } from "../core/src/llm/openai.ts";
import type { ModelSet } from "../core/src/llm/types.ts";
import { createHarness, type Harness } from "../core/src/testing.ts";
import { loadLocalEnv } from "../core/src/localenv.ts";

loadLocalEnv();   // ANTHROPIC_API_KEY / OPENAI_API_KEY for --live, from the gitignored .env.local

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    only: { type: "string" },
    vertical: { type: "string", default: "dental" },
    config: { type: "string", default: path.join(here, "../config/clients/demo-clinic.json") },
    model: { type: "string" },
  },
});

interface Expect {
  tools?: string[];
  no_tools?: true | string[];
  tool_error?: string;
  handled_by?: string;
  escalated?: boolean;
  replies?: number;
  reply_matches?: string;
  reply_not_matches?: string;
  disclosure?: boolean;
  opted_out?: boolean;
  booking?: "created" | "none" | "cancelled" | "booked";
  booking_service?: string;
  offered_part_of_day?: "morning" | "afternoon" | "evening";
  offered_latest_start?: string;
  staff_notified?: boolean;
  owner_notified?: boolean;
  lead_grade?: string;
  lead_status?: string;
  sent_to_customer_matches?: string;
}

interface Turn {
  user?: string;
  staff?: string;
  staff_button?: boolean;
  lead_form?: LeadIntake;
  missed_call?: boolean;
  advance_minutes?: number;
  tick?: boolean;
  take_offered?: number;
  expect?: Expect;
  expect_mock?: Expect;
}

interface Conversation {
  id: string;
  title: string;
  channel?: "sms" | "whatsapp" | "webchat";
  customer?: string;
  at?: string;                                   // local time at the clinic, e.g. 2026-11-10T21:00
  faq?: boolean;
  config?: Record<string, unknown>;              // deep-merged into client.json
  contact?: { name?: string };
  existing_booking?: { hours_ahead: number; service_id: string };
  turns: Turn[];
  rubric?: string;
}

// ------------------------------------------------------------------ models
function liveModels(config: ClientConfig): ModelFactory {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("--live needs ANTHROPIC_API_KEY (in .env.local)");
  const llm = config.assistant.llm;
  // --model provider:model replaces the conversation model only; guardrail and judge stay on Claude Haiku.
  const [provider, model] = args.model ? args.model.split(":") as [string, string] : [llm.primary.provider, llm.primary.model];
  if (provider === "openai" && !process.env.OPENAI_API_KEY) throw new Error("--model openai:* needs OPENAI_API_KEY (in .env.local)");
  if (!model || !["anthropic", "openai"].includes(provider)) throw new Error("--model must look like anthropic:claude-sonnet-5-5 or openai:gpt-6-luna");
  const effort = llm.primary.effort ?? "low";
  const set: ModelSet = {
    primary: provider === "openai" ? new OpenAIConversation(process.env.OPENAI_API_KEY!, model, effort) : new AnthropicConversation(key, model, effort),
    fallback: null,
    classifier: new AnthropicClassifier(key, llm.classifier.model),
    embedder: process.env.OPENAI_API_KEY ? new OpenAIEmbedder(process.env.OPENAI_API_KEY, llm.embeddings.model) : new MockEmbedder(),
  };
  return { forClient: async () => set };
}

const JudgeSchema = z.object({ pass: z.boolean(), reason: z.string() });
async function judge(transcript: string, rubric: string): Promise<{ pass: boolean; reason: string; usage: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const res = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 400,
    system: "You grade a dental clinic's virtual front-desk assistant against a rubric. Judge only the ASSISTANT turns. Pass only if every point in the rubric is met.",
    messages: [{ role: "user", content: `<rubric>\n${rubric}\n</rubric>\n<transcript>\n${transcript}\n</transcript>` }],
    output_config: { effort: "low", format: zodOutputFormat(JudgeSchema) },
  });
  const out = res.parsed_output ?? { pass: false, reason: "judge returned no verdict" };
  return { ...out, usage: res.usage.input_tokens + res.usage.output_tokens };
}

// ------------------------------------------------------------------ helpers
function deepMerge<T>(target: T, patch: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(patch)) {
    const t = target as Record<string, unknown>;
    if (v && typeof v === "object" && !Array.isArray(v) && t[k] && typeof t[k] === "object") deepMerge(t[k], v as Record<string, unknown>);
    else t[k] = v;
  }
  return target;
}

function loadConversations(): Conversation[] {
  const dir = path.join(here, "conversations", args.vertical!);
  return readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()
    .flatMap((f) => YAML.parse(readFileSync(path.join(dir, f), "utf8")) as Conversation[])
    .filter((c) => !args.only || c.id.includes(args.only));
}

interface TurnSnapshot {
  escalations: number;
  bookings: number;
  sent: number;
}

const snapshot = (h: Harness): TurnSnapshot => ({ escalations: h.store.escalations.size, bookings: h.store.bookings.size, sent: h.channels.sent.length });

function check(h: Harness, convo: Conversation, customer: string, e: Expect, before: TurnSnapshot, result: {
  replies: string[]; tools: { name: string; isError: boolean }[]; handledBy?: string;
}): string[] {
  const f: string[] = [];
  const cfg = h.client.config;
  const replies = result.replies.join("\n---\n");
  const names = result.tools.map((t) => t.name);
  const newSends = h.channels.sent.slice(before.sent).map((s) => s.msg);
  const staffPhones = cfg.escalation.staff.map((s) => s.phone);
  const contact = [...h.store.contacts.values()].find((c) => c.phone === customer) ?? [...h.store.contacts.values()].at(-1);
  const thread = [...h.store.threads.values()].filter((t) => t.contact_id === contact?.id).at(-1);
  const lead = [...h.store.leads.values()].at(-1);
  const bookings = [...h.store.bookings.values()];

  for (const t of e.tools ?? []) if (!names.includes(t)) f.push(`expected tool ${t}, got [${names.join(", ")}]`);
  if (e.no_tools === true && names.length) f.push(`expected no tools, got [${names.join(", ")}]`);
  if (Array.isArray(e.no_tools)) for (const t of e.no_tools) if (names.includes(t)) f.push(`tool ${t} must not be called`);
  if (e.tool_error && !result.tools.some((t) => t.name === e.tool_error && t.isError)) f.push(`expected ${e.tool_error} to fail`);
  if (e.handled_by && result.handledBy !== e.handled_by) f.push(`handled_by ${result.handledBy}, expected ${e.handled_by}`);
  if (e.escalated !== undefined && (h.store.escalations.size > before.escalations) !== e.escalated) {
    f.push(e.escalated ? "expected an escalation" : "expected no new escalation");
  }
  if (e.replies !== undefined && result.replies.length !== e.replies) f.push(`expected ${e.replies} replies, got ${result.replies.length}`);
  if (e.reply_matches && !new RegExp(e.reply_matches, "i").test(replies)) f.push(`reply should match /${e.reply_matches}/: "${replies.slice(0, 160)}"`);
  if (e.reply_not_matches && new RegExp(e.reply_not_matches, "i").test(replies)) f.push(`reply must not match /${e.reply_not_matches}/: "${replies.slice(0, 160)}"`);
  if (e.disclosure === true && !result.replies[0]?.startsWith(cfg.assistant.disclosure_text)) f.push("first reply must start with the AI disclosure");
  if (e.disclosure === false && replies.includes(cfg.assistant.disclosure_text)) f.push("disclosure repeated");
  if (e.opted_out !== undefined && !!contact?.opted_out_at !== e.opted_out) f.push(`opted_out should be ${e.opted_out}`);
  if (e.booking === "created" && h.store.bookings.size <= before.bookings) f.push("expected a booking to be created");
  if (e.booking === "none" && h.store.bookings.size !== before.bookings) f.push("expected no new booking");
  if (e.booking === "cancelled" && !bookings.some((b) => b.status === "cancelled")) f.push("expected a cancelled booking");
  if (e.booking === "booked" && !bookings.every((b) => b.status === "booked")) f.push("expected bookings to stay booked");
  if (e.booking_service && bookings.at(-1)?.service_id !== e.booking_service) f.push(`booking service ${bookings.at(-1)?.service_id}, expected ${e.booking_service}`);
  const offered = thread?.state.offered_slots ?? [];
  if (e.offered_part_of_day) {
    const hours = offered.map((s) => DateTime.fromISO(s.start, { setZone: true }).hour);
    const ok = hours.length > 0 && hours.every((hr) => e.offered_part_of_day === "morning" ? hr < 12 : e.offered_part_of_day === "afternoon" ? hr >= 12 && hr < 17 : hr >= 17);
    if (!ok) f.push(`offered slots should all be ${e.offered_part_of_day}: [${offered.map((s) => s.label).join("; ")}]`);
  }
  if (e.offered_latest_start) {
    const late = offered.filter((s) => DateTime.fromISO(s.start, { setZone: true }).toFormat("HH:mm") > e.offered_latest_start!);
    if (!offered.length || late.length) f.push(`offered slots must start by ${e.offered_latest_start}: [${offered.map((s) => s.label).join("; ")}]`);
  }
  if (e.staff_notified !== undefined && newSends.some((m) => staffPhones.includes(m.to)) !== e.staff_notified) f.push(`staff_notified should be ${e.staff_notified}`);
  if (e.owner_notified !== undefined && newSends.some((m) => m.to === cfg.escalation.owner_backup) !== e.owner_notified) f.push(`owner_notified should be ${e.owner_notified}`);
  if (e.lead_grade && lead?.grade !== e.lead_grade) f.push(`lead grade ${lead?.grade}, expected ${e.lead_grade}`);
  if (e.lead_status && lead?.status !== e.lead_status) f.push(`lead status ${lead?.status}, expected ${e.lead_status}`);
  if (e.sent_to_customer_matches && !newSends.some((m) => m.to === customer && new RegExp(e.sent_to_customer_matches!, "i").test(m.text))) {
    f.push(`expected a message to the customer matching /${e.sent_to_customer_matches}/`);
  }
  return f;
}

// ------------------------------------------------------------------ run
async function runConversation(convo: Conversation, baseConfig: ClientConfig) {
  const config = deepMerge(structuredClone(baseConfig), convo.config ?? {});
  const h = createHarness(config, { models: args.live ? liveModels(config) : undefined });
  const tz = config.timezone;
  h.setNow(DateTime.fromISO(convo.at ?? "2026-11-10T11:00", { zone: tz }).toJSDate());
  if (convo.faq !== false) await h.loadFaq();

  const channel = convo.channel ?? "sms";
  const customer = convo.customer ?? (channel === "webchat" ? "qa-session" : "+61411111111");
  const staff = config.escalation.staff[0]!.phone;

  if (convo.contact || convo.existing_booking) {
    const contact = await h.store.insertContact({ client_id: h.client.id, phone: channel === "webchat" ? null : customer, name: convo.contact?.name ?? null });
    await h.store.linkChannel(h.client.id, channel, channel === "whatsapp" ? customer.slice(1) : customer, contact.id);
    if (convo.existing_booking) {
      const svc = config.business.services.find((s) => s.id === convo.existing_booking!.service_id)!;
      const start = DateTime.fromJSDate(h.now()).plus({ hours: convo.existing_booking.hours_ahead }).startOf("hour");
      const ext = await h.calendar.book({
        slot: { start, end: start.plus({ minutes: svc.duration_minutes }), practitionerId: config.booking?.calendars?.[0]?.id ?? null, practitioner: config.booking?.calendars?.[0]?.practitioner ?? null },
        service: svc, patient: { name: contact.name ?? "Patient", phone: contact.phone, email: null, isNew: false }, notes: "", idempotencyKey: "existing",
      });
      await h.store.upsertBooking({
        client_id: h.client.id, contact_id: contact.id, adapter: "fake", external_booking_id: ext.externalId, service_id: svc.id,
        practitioner: config.booking?.calendars?.[0]?.practitioner ?? null, starts_at: start.toUTC().toISO()!, ends_at: start.plus({ minutes: svc.duration_minutes }).toUTC().toISO()!,
      });
    }
  }

  const failures: string[] = [];
  const transcript: string[] = [];
  for (const [i, turn] of convo.turns.entries()) {
    const before = snapshot(h);
    let replies: string[] = [];
    let tools: { name: string; isError: boolean }[] = [];
    let handledBy: string | undefined;
    try {
      if (turn.user !== undefined) {
        transcript.push(`Customer: ${turn.user}`);
        const out = await h.receive(channel, customer, turn.user);
        replies = out.turn?.replies ?? [];
        tools = out.turn?.toolCalls.map((t) => ({ name: t.name, isError: t.isError })) ?? [];
        handledBy = out.turn?.handledBy;
      } else if (turn.staff !== undefined || turn.staff_button) {
        const esc = [...h.store.escalations.values()].at(-1);
        transcript.push(`Staff: ${turn.staff ?? "[taps I'll take it]"}`);
        await h.receive("whatsapp", staff, turn.staff ?? "I'll take it", turn.staff_button && esc ? { buttonPayload: `claim:${esc.id}` } : {});
        replies = h.channels.sent.slice(before.sent).filter((s) => s.msg.to === customer).map((s) => s.msg.text);
      } else if (turn.lead_form) {
        transcript.push(`[web form: ${JSON.stringify(turn.lead_form)}]`);
        await handleLeadIntake(h.ctx, { phone: customer, ...turn.lead_form });
        replies = h.channels.sent.slice(before.sent).filter((s) => s.msg.to === customer).map((s) => s.msg.text);
      } else if (turn.missed_call) {
        transcript.push("[missed call]");
        await handleMissedCall(h.ctx, { From: customer, CallSid: `CA-${convo.id}` });
        replies = h.channels.sent.slice(before.sent).filter((s) => s.msg.to === customer).map((s) => s.msg.text);
      } else if (turn.take_offered !== undefined) {
        const thread = [...h.store.threads.values()].at(-1)!;
        const slot = thread.state.offered_slots![turn.take_offered]!;
        h.calendar.booked.set(`taken-${i}`, { start: DateTime.fromISO(slot.start), end: DateTime.fromISO(slot.end), practitionerId: slot.practitioner_id, patient: "someone else", cancelled: false });
        transcript.push(`[someone else books ${slot.label}]`);
      } else if (turn.advance_minutes !== undefined || turn.tick) {
        if (turn.advance_minutes) h.advance(turn.advance_minutes);
        if (turn.tick) await runTick(h.deps);
        transcript.push(`[${turn.advance_minutes ? `${turn.advance_minutes} min later` : ""}${turn.tick ? " scheduler runs" : ""}]`);
        replies = h.channels.sent.slice(before.sent).filter((s) => s.msg.to === customer).map((s) => s.msg.text);
      }
    } catch (err) {
      failures.push(`turn ${i + 1}: threw ${(err as Error).stack ?? err}`);
      break;
    }
    for (const r of replies) transcript.push(`Assistant: ${r}`);
    const label = `turn ${i + 1}`;
    for (const msg of check(h, convo, customer, turn.expect ?? {}, before, { replies, tools, handledBy })) failures.push(`${label}: ${msg}`);
    if (!args.live) for (const msg of check(h, convo, customer, turn.expect_mock ?? {}, before, { replies, tools, handledBy })) failures.push(`${label} (mock): ${msg}`);
    // Invariant on every turn: never a price the clinic didn't give us.
    const faq = h.store.faq.map((x) => ({ id: x.id, source: x.source, content: x.content, similarity: 1 }));
    const invented = replies.flatMap((r) => unknownPrices(h.ctx, r, faq));
    if (invented.length) failures.push(`${label}: invented price(s) ${invented.join(", ")}`);
  }

  let rubric: { pass: boolean; reason: string } | null = null;
  if (args.live && convo.rubric) {
    const j = await judge(transcript.join("\n"), convo.rubric);
    rubric = { pass: j.pass, reason: j.reason };
    if (!j.pass) failures.push(`rubric: ${j.reason}`);
  }
  return { convo, failures, transcript, rubric, costUsd: h.store.usage.reduce((sum, u) => sum + u.cost_usd, 0) };
}

const baseConfig = readClientConfigFile(args.config!);
if (args.live) {
  try {
    liveModels(baseConfig);   // fail fast on missing keys or a malformed --model
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(2);
  }
}
const conversations = loadConversations();
const started = Date.now();
const results = [];
for (const convo of conversations) {
  const r = await runConversation(convo, baseConfig);
  results.push(r);
  console.log(`${r.failures.length ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m"} ${convo.id.padEnd(34)} ${convo.title}`);
  for (const f of r.failures) console.log(`    ${f}`);
}

const passed = results.filter((r) => !r.failures.length).length;
const cost = results.reduce((s, r) => s + r.costUsd, 0);
const mode = args.live ? `live${args.model ? `-${args.model.replace(/[^a-z0-9.-]/gi, "_")}` : ""}` : "mock";
const required = args.live ? Math.ceil(results.length * 0.96) : results.length;   // live: ≥48/50
const ok = passed >= required;
console.log(`\n${passed}/${results.length} passed (${mode}; need ${required}) in ${((Date.now() - started) / 1000).toFixed(1)}s${args.live ? ` · model cost ≈ $${cost.toFixed(3)}` : ""}`);

const reportDir = path.join(here, "reports");
mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const report = [
  `# QA ${mode} run — ${new Date().toISOString()}`,
  "",
  `Config: \`${path.relative(path.join(here, ".."), args.config!)}\` · ${passed}/${results.length} passed (need ${required}) · ${ok ? "PASS" : "FAIL"}${args.live ? ` · model cost ≈ $${cost.toFixed(3)}` : ""}`,
  "",
  "| Conversation | Result | Notes |",
  "|---|---|---|",
  ...results.map((r) => `| ${r.convo.id} | ${r.failures.length ? "fail" : "pass"} | ${(r.failures.join("<br>") || r.rubric?.reason || "").replace(/\|/g, "\\|").slice(0, 400)} |`),
  "",
  "## Transcripts",
  ...results.flatMap((r) => ["", `### ${r.convo.id} — ${r.convo.title}`, "", "```text", ...r.transcript, "```"]),
].join("\n");
writeFileSync(path.join(reportDir, `${stamp}-${mode}.md`), report);
console.log(`report: qa/reports/${stamp}-${mode}.md`);
process.exit(ok ? 0 : 1);
