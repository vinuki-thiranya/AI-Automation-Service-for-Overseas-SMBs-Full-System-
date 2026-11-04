// One customer turn, end to end (spec §4.2):
// STOP/START → opted-out → staff owns thread → rate limit → lead-flow answer → degraded / spend cap →
// guardrail → retrieval → model with tools (primary, then fallback) → price check → send → record.
import { bookingLabel } from "../booking/service.ts";
import { isStartMessage, isStopMessage, startReply, stopReply } from "../compliance.ts";
import type { Ctx } from "../context.ts";
import { forwardToClaimer, openEscalation } from "../escalation.ts";
import { hoursSummary, isOpenAt, localNow, localTimeDescription } from "../hours.ts";
import { handleLeadAnswer, stopNurtureOnReply, usageRows } from "../leads.ts";
import type { ChatTurn, ConversationResult, GuardrailVerdict, ToolCallRecord, TurnContext, UsageEntry } from "../llm/types.ts";
import { ModelUnavailableError } from "../llm/types.ts";
import { sendToThread } from "../messaging.ts";
import type { ContactRow, FaqMatch, MessageRow, ThreadRow } from "../store/types.ts";
import { buildSystemPrompt, buildTurnNote, formatPrice } from "./prompt.ts";
import { executeTool, toolSpecs, type ToolEnv } from "./tools.ts";

export interface TurnResult {
  replies: string[];
  handledBy: "stop" | "start" | "opted_out" | "staff" | "rate_limit" | "lead_flow" | "guardrail" | "model" | "fallback" | "ignored";
  escalated: boolean;
  verdict?: GuardrailVerdict;
  toolCalls: ToolCallRecord[];
  model?: string;
}

const HISTORY_TURNS = 20;
const systemPromptCache = new Map<string, { key: string; prompt: string }>();

function systemPrompt(ctx: Ctx): string {
  const key = JSON.stringify(ctx.client.config);
  const hit = systemPromptCache.get(ctx.client.slug);
  if (hit?.key === key) return hit.prompt;
  const prompt = buildSystemPrompt(ctx.client.config);
  systemPromptCache.set(ctx.client.slug, { key, prompt });
  return prompt;
}

export function fallbackText(ctx: Ctx): string {
  const cfg = ctx.client.config;
  const open = isOpenAt(cfg, localNow(cfg, ctx.now()));
  return `Thanks for your message. Our assistant can't answer properly right now, so a team member will get back to you${open ? " shortly" : " when we reopen"}. For anything urgent, please call ${cfg.business.phone}.`;
}

function toTurns(messages: MessageRow[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (!m.body) continue;
    const role = m.author === "customer" ? "user" : "assistant";
    const text = m.author === "staff" ? `[Staff member replied] ${m.body}` : m.body;
    const last = turns.at(-1);
    if (last && last.role === role) last.text += `\n${text}`;
    else turns.push({ role, text });
  }
  while (turns[0]?.role === "assistant") turns.shift();   // the API wants a user turn first
  return turns;
}

/** Amounts with a currency sign that appear nowhere in the client's own config are treated as invented. */
export function unknownPrices(ctx: Ctx, reply: string, faq: FaqMatch[]): string[] {
  const amounts = (s: string) => [...s.matchAll(/(?:[$£€]|\b(?:AUD|USD|GBP|EUR)\s?)\s?(\d[\d,]*(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));
  const known = new Set<number>([
    ...ctx.client.config.business.services.map((s) => s.price?.amount).filter((a): a is number => a !== undefined),
    ...amounts(JSON.stringify(ctx.client.config.business.policies ?? {})),
    ...faq.flatMap((f) => amounts(f.content)),
  ]);
  return amounts(reply).filter((a) => !known.has(a)).map(String);
}

async function recordUsage(ctx: Ctx, usage: UsageEntry[]) {
  const rows = usageRows(ctx, usage);
  if (rows.length) await ctx.store.insertUsage(rows);
}

async function maybeSummarize(ctx: Ctx, thread: ThreadRow, all: MessageRow[], usage: UsageEntry[]) {
  // Keep a rolling summary of what falls out of the last-20-turn window (every 10 messages).
  if (all.length <= HISTORY_TURNS || all.length % 10 !== 0) return;
  try {
    const models = await ctx.deps.models.forClient(ctx.client);
    const older = toTurns(all.slice(0, all.length - HISTORY_TURNS)).slice(-10);
    const res = await models.classifier.summarize({ previousSummary: thread.summary, turns: older });
    usage.push(...res.usage);
    Object.assign(thread, await ctx.store.updateThread(thread.id, { summary: res.summary }));
  } catch {
    // A missing summary only shortens memory; never fail the turn for it.
  }
}

export async function handleCustomerMessage(ctx: Ctx, thread: ThreadRow, contact: ContactRow, inbound: MessageRow): Promise<TurnResult> {
  const cfg = ctx.client.config;
  const text = (inbound.body ?? "").trim();
  const result: TurnResult = { replies: [], handledBy: "ignored", escalated: false, toolCalls: [] };
  const usage: UsageEntry[] = [];
  const reply = async (body: string, opts: Parameters<typeof sendToThread>[4] = {}) => {
    const res = await sendToThread(ctx, thread, contact, body, opts);
    result.replies.push(res.text);
    return res;
  };

  // 1. Opt-out / opt-in. Only the confirmation is sent after STOP.
  if (isStopMessage(cfg, text)) {
    Object.assign(contact, await ctx.store.updateContact(contact.id, { opted_out_at: ctx.now().toISOString() }));
    await stopNurtureOnReply(ctx, contact);
    await ctx.deps.events.emit(ctx.client, "contact.opted_out", { contact_id: contact.id, channel: thread.channel });
    await reply(stopReply(cfg), { author: "system", noDisclosure: true });
    return { ...result, handledBy: "stop" };
  }
  if (contact.opted_out_at) {
    if (isStartMessage(text)) {
      Object.assign(contact, await ctx.store.updateContact(contact.id, { opted_out_at: null }));
      await reply(startReply(cfg), { author: "system", noDisclosure: true });
      return { ...result, handledBy: "start" };
    }
    // Opted out: store the message, send nothing (carriers block SMS after STOP anyway).
    return { ...result, handledBy: "opted_out" };
  }

  await stopNurtureOnReply(ctx, contact);

  // 2. A person owns this thread: pass the message to them; the AI stays quiet.
  if (thread.ai_paused_until && new Date(thread.ai_paused_until) > ctx.now()) {
    const esc = await ctx.store.findOpenEscalationForThread(thread.id);
    if (esc) {
      await forwardToClaimer(ctx, esc, contact, text);
      return { ...result, handledBy: "staff", escalated: true };
    }
  }

  // 3. Rate limit per contact.
  const limit = cfg.assistant.max_messages_per_contact_per_hour ?? 30;
  const recent = await ctx.store.countInbound(ctx.client.id, contact.id, new Date(ctx.now().getTime() - 3600_000).toISOString());
  if (recent > limit) {
    const notified = thread.state.rate_limit_notified_at;
    if (!notified || ctx.now().getTime() - new Date(notified).getTime() > 3600_000) {
      thread.state = { ...thread.state, rate_limit_notified_at: ctx.now().toISOString() };
      await ctx.store.updateThread(thread.id, { state: thread.state });
      await reply("We've received a lot of messages from you in a short time. A team member will review them and get back to you.", { author: "system" });
      await ctx.deps.alerts.notify(`ratelimit:${ctx.client.slug}:${contact.id}`, `Rate limit hit for ${ctx.client.slug} contact ${contact.id}`, 60);
    }
    return { ...result, handledBy: "rate_limit" };
  }

  // 4. Lead qualification answers.
  if (thread.state.lead) {
    const lead = await handleLeadAnswer(ctx, thread, contact, text);
    if (lead) {
      await recordUsage(ctx, lead.usage);
      await reply(lead.reply);
      return { ...result, handledBy: "lead_flow" };
    }
  }

  // 5. Degraded mode (repeated failures) or spend cap reached → fixed message + escalation.
  const monthStart = new Date(Date.UTC(ctx.now().getUTCFullYear(), ctx.now().getUTCMonth(), 1)).toISOString();
  const spent = await ctx.store.sumUsageSince(ctx.client.id, monthStart);
  const capHit = spent >= cfg.assistant.llm.monthly_cap_usd;
  if (capHit || ctx.deps.alerts.isDegraded(ctx.client)) {
    if (capHit) await ctx.deps.alerts.notify(`cap:${ctx.client.slug}`, `${ctx.client.slug} hit its LLM cap ($${spent.toFixed(2)} of $${cfg.assistant.llm.monthly_cap_usd}). Conversations are going to staff.`, 24 * 60);
    await openEscalation(ctx, thread, contact, { reason: capHit ? "spend_cap" : "llm_outage", summary: `Customer wrote: ${text.slice(0, 300)}` });
    await reply(fallbackText(ctx));
    return { ...result, handledBy: "fallback", escalated: true };
  }

  const models = await ctx.deps.models.forClient(ctx.client);
  const history = await ctx.store.listThreadMessages(thread.id, 60);
  const turns = toTurns(history.slice(-HISTORY_TURNS));

  // 6. Guardrail classifier.
  let verdict: GuardrailVerdict = { category: "ok", confidence: 0, language: "en", reason: "classifier unavailable" };
  try {
    const g = await models.classifier.guardrail({ text, recent: turns.slice(0, -1), business: `${cfg.name} (${cfg.vertical})` });
    verdict = g.verdict;
    usage.push(...g.usage);
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, "guardrail", err);
  }
  result.verdict = verdict;

  const localNowDt = localNow(cfg, ctx.now());
  const open = isOpenAt(cfg, localNowDt);
  if (verdict.category === "prompt_injection" && verdict.confidence >= 0.6) {
    await ctx.store.audit(ctx.client.id, "core:guardrail", "prompt_injection_blocked", { thread_id: thread.id, reason: verdict.reason });
    await reply(`I can help with appointments and questions about ${cfg.name}. What can I do for you?`);
    await recordUsage(ctx, usage);
    return { ...result, handledBy: "guardrail" };
  }
  if (verdict.category === "abuse" && verdict.confidence >= 0.6) {
    const count = (thread.state.abuse_count ?? 0) + 1;
    thread.state = { ...thread.state, abuse_count: count };
    await ctx.store.updateThread(thread.id, { state: thread.state });
    if (count >= 2) {
      await openEscalation(ctx, thread, contact, { reason: "abuse", summary: `Abusive messages. Latest: ${text.slice(0, 200)}` });
      result.escalated = true;
    }
    await reply("I'm here to help with appointments and questions. Let's keep things respectful, please.");
    await recordUsage(ctx, usage);
    return { ...result, handledBy: "guardrail" };
  }
  if (verdict.category === "wants_human") {
    await openEscalation(ctx, thread, contact, { reason: "customer_request", summary: `Asked for a person: ${text.slice(0, 300)}` });
    await reply(open ? "No problem, I've asked a team member to reply to you here shortly." : `No problem. We're closed right now, so a team member will reply when we reopen. For anything urgent, call ${cfg.business.phone}.`);
    await recordUsage(ctx, usage);
    return { ...result, handledBy: "guardrail", escalated: true };
  }

  // 7. Retrieval over the client's FAQ chunks.
  let faq: FaqMatch[] = [];
  if (models.embedder) {
    try {
      const e = await models.embedder.embed([text]);
      usage.push(...e.usage);
      faq = (await ctx.store.matchFaq(ctx.client.id, e.vectors[0]!, 5)).filter((f) => f.similarity > 0.2);
    } catch (err) {
      await ctx.deps.alerts.recordFailure(ctx.client, "retrieval", err);
    }
  }

  // 8. Model with tools.
  const upcoming = (await ctx.store.listUpcomingBookingsForContact(ctx.client.id, contact.id, ctx.now().toISOString()))
    .map((b) => ({ booking_id: b.id, label: bookingLabel(ctx, b), service_id: b.service_id }));
  const adapter = cfg.booking ? await ctx.deps.bookingFor(ctx.client).catch(() => null) : null;
  const bookingMode = !cfg.booking ? "none" : adapter?.mode === "link" ? "link" : "direct";
  const flags: string[] = [];
  if (verdict.category === "emergency") flags.push(`Possible emergency flagged. ${open ? "Offer the earliest emergency appointment." : "The practice is closed: give the emergency instructions."}`);
  if (verdict.category === "out_of_scope") flags.push("The message looks unrelated to the practice. Politely steer back to what you can help with.");
  if (!open) flags.push("After hours: start with the after-hours greeting if you haven't already today.");
  if (verdict.language !== "en" && cfg.assistant.languages.includes(verdict.language)) flags.push(`The customer is writing in '${verdict.language}'. Reply in that language.`);
  const isNewContact = history.filter((m) => m.direction === "inbound").length <= 1;

  const context: TurnContext = {
    note: buildTurnNote({
      localTime: localTimeDescription(cfg, ctx.now()), open, channel: thread.channel, contactName: contact.name, isNewContact,
      summary: thread.summary, upcoming, offered: thread.state.offered_slots ?? [], faq, flags, bookingMode,
    }),
    localTime: localTimeDescription(cfg, ctx.now()),
    afterHours: !open,
    emergency: verdict.category === "emergency",
    contactName: contact.name,
    isNewContact,
    services: cfg.business.services.map((s) => ({ id: s.id, name: s.name, price: formatPrice(s.price, s.price_note) })),
    hoursSummary: hoursSummary(cfg),
    address: cfg.business.address,
    parking: cfg.business.parking ?? null,
    faq,
    offeredSlots: thread.state.offered_slots ?? [],
    upcomingBookings: upcoming,
    documents: (cfg.business.documents ?? []).map((d) => ({ id: d.id, name: d.name })),
    bookingMode: bookingMode === "link" ? "link" : "direct",
  };
  const toolEnv: ToolEnv = { ctx, thread, contact, escalated: false };
  const request = {
    system: systemPrompt(ctx),
    history: turns,
    context,
    tools: toolSpecs(ctx),
    executeTool: (name: string, input: unknown) => executeTool(toolEnv, name, input),
    maxIterations: 6,
  };

  let outcome: ConversationResult | null = null;
  for (const model of [models.primary, models.fallback]) {
    if (!model) continue;
    try {
      outcome = await model.run(request);
      usage.push(...outcome.usage);
      break;   // a refusal or empty answer is handled below, not retried on another model
    } catch (err) {
      const what = err instanceof ModelUnavailableError ? `model ${model.model} unavailable` : `model ${model.model}`;
      await ctx.deps.alerts.recordFailure(ctx.client, what, err);
      outcome = null;
    }
  }
  result.toolCalls = outcome?.toolCalls ?? [];
  result.model = outcome?.model;
  result.escalated = result.escalated || toolEnv.escalated;

  // 9. No usable answer → fixed message + escalation.
  if (!outcome || outcome.refused || !outcome.text) {
    await openEscalation(ctx, thread, contact, {
      reason: outcome?.refused ? "guardrail" : "llm_outage",
      summary: `${outcome?.refused ? "Assistant declined to answer" : "Assistant unavailable"}. Customer wrote: ${text.slice(0, 300)}`,
    });
    await reply(fallbackText(ctx));
    await recordUsage(ctx, usage);
    return { ...result, handledBy: "fallback", escalated: true };
  }

  // 10. Never send a price the client didn't give us.
  let finalText = outcome.text;
  const invented = unknownPrices(ctx, finalText, faq);
  if (invented.length) {
    await ctx.store.audit(ctx.client.id, "core:guardrail", "unknown_price_blocked", { thread_id: thread.id, amounts: invented, reply: finalText.slice(0, 500) });
    if (!toolEnv.escalated) {
      await openEscalation(ctx, thread, contact, { reason: "low_confidence", summary: `Price question needs confirming. Customer wrote: ${text.slice(0, 300)}` });
      result.escalated = true;
    }
    finalText = "Let me get a team member to confirm the exact cost for you. They'll reply here shortly.";
  }

  await reply(finalText, { metadata: { model: outcome.model, provider: outcome.provider, guardrail: verdict.category, tools: result.toolCalls.map((t) => t.name) } });
  await maybeSummarize(ctx, thread, history, usage);
  await recordUsage(ctx, usage);
  return { ...result, handledBy: "model" };
}
