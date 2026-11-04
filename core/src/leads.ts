// Lead qualification (spec §4.4): scripted questions from client.json, weighted rule score blended with an
// LLM judgement, Hot/Warm/Cold routing, 14-day nurture (consent-gated), speed-to-lead, CRM sync.
import type { LeadConfig, LeadQuestion } from "./config/index.ts";
import { canSendMarketing } from "./compliance.ts";
import type { Ctx } from "./context.ts";
import { notifyPhone, sendToThread } from "./messaging.ts";
import type { ContactRow, LeadGrade, LeadRow, ThreadRow, UsageRow } from "./store/types.ts";
import type { UsageEntry } from "./llm/types.ts";
import { firstName, errorMessage } from "./util.ts";

export function leadConfig(ctx: Ctx): LeadConfig | null {
  return ctx.client.config.lead_qualification ?? null;
}

export function usageRows(ctx: Ctx, usage: UsageEntry[]): UsageRow[] {
  return usage.filter((u) => u.provider !== "mock").map((u) => ({
    client_id: ctx.client.id, provider: u.provider, kind: u.kind, model: u.model,
    units: u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens, cost_usd: u.costUsd,
  }));
}

export function questionText(q: LeadQuestion): string {
  if (q.type !== "choice" || !q.options?.length) return q.text;
  const labels = q.options.map((o) => o.label);
  return `${q.text} (${labels.slice(0, -1).join(", ")} or ${labels.at(-1)})`;
}

/** skip_if supports "<question_id> == <label>" and "!=" against earlier answers. */
function shouldSkip(q: LeadQuestion, answers: Record<string, string>): boolean {
  const m = q.skip_if?.match(/^\s*([a-z0-9-]+)\s*(==|!=)\s*(.+?)\s*$/i);
  if (!m) return false;
  const [, id, op, value] = m as unknown as [string, string, string, string];
  const actual = (answers[id] ?? "").toLowerCase();
  const expected = value.replace(/^["']|["']$/g, "").toLowerCase();
  return op === "==" ? actual === expected : actual !== expected;
}

function nextStep(cfg: LeadConfig, from: number, answers: Record<string, string>): number {
  let i = from;
  while (i < cfg.questions.length && (answers[cfg.questions[i]!.id] !== undefined || shouldSkip(cfg.questions[i]!, answers))) i++;
  return i;
}

/** Weighted 0–10 score over choice questions (option score / best option score for that question). */
export function ruleScore(cfg: LeadConfig, answers: Record<string, string>): number | null {
  let got = 0;
  let max = 0;
  for (const q of cfg.questions) {
    if (q.type !== "choice" || !q.options?.length) continue;
    const weight = q.weight ?? 1;
    const best = Math.max(...q.options.map((o) => o.score));
    const answer = answers[q.id];
    const chosen = q.options.find((o) => o.label.toLowerCase() === answer?.toLowerCase());
    max += weight * best;
    got += weight * (chosen?.score ?? 0);
  }
  return max > 0 ? Math.round((got / max) * 100) / 10 : null;
}

export function gradeFor(cfg: LeadConfig, score: number): LeadGrade {
  return score >= cfg.thresholds.hot ? "hot" : score >= cfg.thresholds.warm ? "warm" : "cold";
}

export async function startLeadFlow(ctx: Ctx, thread: ThreadRow, contact: ContactRow, input: {
  source: string; answers?: Record<string, string>; receivedAt?: string;
}): Promise<{ lead: LeadRow; question: string | null }> {
  const cfg = leadConfig(ctx);
  if (!cfg) throw new Error("lead qualification is not configured for this client");
  const existing = (await ctx.store.listActiveLeadsForContact(ctx.client.id, contact.id))[0];
  const lead = existing ?? await ctx.store.insertLead({
    client_id: ctx.client.id, contact_id: contact.id, thread_id: thread.id, source: input.source, status: "qualifying",
    answers: input.answers ?? {}, received_at: input.receivedAt ?? ctx.now().toISOString(),
  });
  if (!existing) await ctx.deps.events.emit(ctx.client, "lead.created", { lead_id: lead.id, source: lead.source });
  if (existing && existing.status === "nurturing") {
    await ctx.store.updateLead(existing.id, { status: "qualifying", nurture_stopped_at: ctx.now().toISOString() });
  }
  const step = nextStep(cfg, 0, lead.answers);
  const q = cfg.questions[step];
  await ctx.store.updateThread(thread.id, { state: { ...thread.state, lead: q ? { lead_id: lead.id, step, asked_at: ctx.now().toISOString() } : undefined } });
  thread.state = { ...thread.state, lead: q ? { lead_id: lead.id, step, asked_at: ctx.now().toISOString() } : undefined };
  return { lead, question: q ? questionText(q) : null };
}

/**
 * Called for each customer message while a lead flow is active. Returns null when the message is not an
 * answer (a question or a booking request): the flow pauses and the conversation engine takes over.
 */
export async function handleLeadAnswer(ctx: Ctx, thread: ThreadRow, contact: ContactRow, text: string): Promise<{ reply: string; usage: UsageEntry[] } | null> {
  const cfg = leadConfig(ctx);
  const flow = thread.state.lead;
  if (!cfg || !flow) return null;
  const lead = await ctx.store.getLead(flow.lead_id);
  const q = cfg.questions[flow.step];
  if (!lead || !q) {
    await clearFlow(ctx, thread);
    return null;
  }
  if (text.includes("?") || text.length > 160 || /\b(book|appointment|available)\b/i.test(text)) {
    await clearFlow(ctx, thread);
    return null;
  }

  const usage: UsageEntry[] = [];
  let answer: string | null = text.trim();
  if (q.type === "choice" && q.options?.length) {
    const labels = q.options.map((o) => o.label);
    const exact = labels.find((l) => l.toLowerCase() === text.trim().toLowerCase()) ?? labels[Number(text.trim()) - 1];
    if (exact) answer = exact;
    else {
      const models = await ctx.deps.models.forClient(ctx.client);
      const mapped = await models.classifier.mapChoice({ question: q.text, options: labels, reply: text }).catch(() => ({ option: null, usage: [] }));
      usage.push(...mapped.usage);
      answer = mapped.option;
    }
    if (!answer) return { reply: `Sorry, I didn't catch that. ${questionText(q)}`, usage };
  }

  const answers = { ...lead.answers, [q.id]: answer! };
  await ctx.store.updateLead(lead.id, { answers });
  const step = nextStep(cfg, flow.step + 1, answers);
  const next = cfg.questions[step];
  if (next) {
    await ctx.store.updateThread(thread.id, { state: { ...thread.state, lead: { lead_id: lead.id, step, asked_at: ctx.now().toISOString() } } });
    thread.state = { ...thread.state, lead: { lead_id: lead.id, step, asked_at: ctx.now().toISOString() } };
    return { reply: questionText(next), usage };
  }
  await clearFlow(ctx, thread);
  const done = await finishLead(ctx, { ...lead, answers }, thread, contact);
  return { reply: done.reply, usage: [...usage, ...done.usage] };
}

async function clearFlow(ctx: Ctx, thread: ThreadRow) {
  const state = { ...thread.state };
  delete state.lead;
  await ctx.store.updateThread(thread.id, { state });
  thread.state = state;
}

export async function finishLead(ctx: Ctx, lead: LeadRow, thread: ThreadRow, contact: ContactRow): Promise<{ reply: string; grade: LeadGrade; usage: UsageEntry[] }> {
  const cfg = leadConfig(ctx)!;
  const usage: UsageEntry[] = [];
  const rules = ruleScore(cfg, lead.answers);
  let llm: number | null = null;
  try {
    const models = await ctx.deps.models.forClient(ctx.client);
    const transcript = (await ctx.store.listThreadMessages(thread.id, 20)).map((m) => `${m.author}: ${m.body ?? ""}`).join("\n");
    const judged = await models.classifier.judgeLead({ business: ctx.client.config.name, answers: lead.answers, transcript });
    llm = judged.score;
    usage.push(...judged.usage);
  } catch (err) {
    await ctx.store.audit(ctx.client.id, "core:leads", "llm_judgement_failed", { lead_id: lead.id, error: errorMessage(err) });
  }
  const w = cfg.llm_judgement_weight ?? 0.3;
  const score = rules === null ? (llm ?? 5) : llm === null ? rules : Math.round(((1 - w) * rules + w * llm) * 10) / 10;
  const grade = gradeFor(cfg, score);
  const name = firstName(contact.name) || "there";

  let reply: string;
  let patch: Partial<LeadRow> = { rule_score: rules, llm_score: llm, score, grade };
  if (grade === "hot") {
    patch = { ...patch, status: "new" };
    reply = `Thanks ${name}! The best next step is a visit with the team. Would you like me to find you a time?`;
    for (const phone of cfg.hot_notify ?? []) {
      await notifyPhone(ctx, phone, `Hot lead: ${contact.name ?? ""} ${contact.phone ?? contact.email ?? ""}. ${Object.entries(lead.answers).map(([k, v]) => `${k}: ${v}`).join(", ")}`, { via: "sms" });
    }
    await ctx.deps.events.emit(ctx.client, "lead.hot", { lead_id: lead.id, score, answers: lead.answers });
  } else if (grade === "warm" && cfg.nurture?.length && canSendMarketing(contact)) {
    const first = cfg.nurture[0]!;
    const due = new Date(new Date(lead.received_at).getTime() + Math.max(first.day, 0) * 86_400_000 + (first.day === 0 ? 3600_000 : 0));
    patch = { ...patch, status: "nurturing", nurture_step: 0, next_nurture_at: due.toISOString() };
    reply = `Thanks ${name}, that's really helpful. I'll send you a bit more information over the next couple of weeks. Reply any time if you'd like to book.`;
  } else if (grade === "warm") {
    patch = { ...patch, status: "new" };
    reply = `Thanks ${name}, that's really helpful. Whenever you're ready, just message here and I can find you a time.`;
  } else {
    patch = { ...patch, status: "archived" };
    reply = `Thanks ${name}! If you have any other questions, just message here.`;
  }
  const updated = await ctx.store.updateLead(lead.id, patch);
  await ctx.deps.events.emit(ctx.client, "lead.scored", { lead_id: lead.id, score, grade });
  await syncLeadToCrm(ctx, updated, contact);
  return { reply, grade, usage };
}

export async function syncLeadToCrm(ctx: Ctx, lead: LeadRow, contact: ContactRow): Promise<void> {
  try {
    const crm = await ctx.deps.crmFor(ctx.client);
    if (!crm) return;
    const { externalId } = await crm.upsertContact(
      { name: contact.name, phone: contact.phone, email: contact.email, externalId: contact.crm_external_id },
      // transcript_url is added in Phase 3, when the client dashboard serves transcripts.
      { lead_grade: lead.grade, lead_score: lead.score, source: lead.source },
    );
    if (externalId !== contact.crm_external_id) await ctx.store.updateContact(contact.id, { crm_external_id: externalId });
    await ctx.store.updateLead(lead.id, { crm_external_id: externalId });
    const answers = Object.entries(lead.answers).map(([k, v]) => `${k}: ${v}`).join("\n");
    await crm.addNote(externalId, `Lead from ${lead.source}: ${lead.grade ?? "unscored"} (${lead.score ?? "-"}/10)\n${answers}`);
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, "crm sync", err);
  }
}

/** Inbound reply from a lead in nurture stops the sequence immediately (spec §4.4). */
export async function stopNurtureOnReply(ctx: Ctx, contact: ContactRow): Promise<void> {
  for (const lead of await ctx.store.listActiveLeadsForContact(ctx.client.id, contact.id)) {
    if (lead.status === "nurturing") {
      await ctx.store.updateLead(lead.id, { status: "new", nurture_stopped_at: ctx.now().toISOString(), next_nurture_at: null });
    }
  }
}

/** Scheduled: send due nurture steps (consent-gated, idempotent per step). */
export async function nurtureTick(ctx: Ctx): Promise<number> {
  const cfg = leadConfig(ctx);
  if (!cfg?.nurture?.length) return 0;
  let sent = 0;
  for (const lead of await ctx.store.listLeadsDueForNurture(ctx.client.id, ctx.now().toISOString())) {
    const contact = lead.contact_id ? await ctx.store.getContact(lead.contact_id) : null;
    const step = cfg.nurture[lead.nurture_step];
    if (!contact || !step || !canSendMarketing(contact)) {
      await ctx.store.updateLead(lead.id, { status: contact?.opted_out_at ? "lost" : "archived", nurture_stopped_at: ctx.now().toISOString(), next_nurture_at: null });
      continue;
    }
    if (await ctx.store.markOnce(ctx.client.id, `nurture:${lead.id}:${lead.nurture_step}`)) {
      const text = step.text.replaceAll("{name}", firstName(contact.name) || "there");
      const thread = await threadForChannel(ctx, contact, step.channel, lead.thread_id);
      if (thread) {
        const template = step.channel === "whatsapp" && step.template ? { name: step.template, bodyParams: [firstName(contact.name) || "there"] } : undefined;
        const res = await sendToThread(ctx, thread, contact, text, { template, subject: step.subject, metadata: { nurture_step: lead.nurture_step, lead_id: lead.id } });
        if (res.sent) sent++;
      }
    }
    const nextIndex = lead.nurture_step + 1;
    const next = cfg.nurture[nextIndex];
    await ctx.store.updateLead(lead.id, next
      ? { nurture_step: nextIndex, next_nurture_at: new Date(new Date(lead.received_at).getTime() + next.day * 86_400_000).toISOString() }
      : { nurture_step: nextIndex, status: "archived", next_nurture_at: null, nurture_stopped_at: ctx.now().toISOString() });
  }
  return sent;
}

async function threadForChannel(ctx: Ctx, contact: ContactRow, channel: "sms" | "whatsapp" | "email", preferredThreadId: string | null): Promise<ThreadRow | null> {
  if (preferredThreadId) {
    const t = await ctx.store.getThread(preferredThreadId);
    if (t && t.channel === channel) return t;
  }
  if ((channel === "email" && !contact.email) || (channel !== "email" && !contact.phone)) return null;
  return (await ctx.store.findLatestThread(ctx.client.id, contact.id, channel))
    ?? await ctx.store.insertThread({ client_id: ctx.client.id, contact_id: contact.id, channel });
}
