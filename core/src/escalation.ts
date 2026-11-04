// Human-in-the-loop (spec §4.9): escalation card with "I'll take it", first tap claims, staff replies from
// their own phone are relayed to the customer, the AI pauses on that thread, unclaimed → owner backup ping.
import type { Ctx } from "./context.ts";
import { getJsonSecret } from "./secrets.ts";
import { notifyPhone, sendToThread, staffChannel } from "./messaging.ts";
import type { ContactRow, EscalationRow, ThreadRow } from "./store/types.ts";
import { TelegramBot } from "./telegram.ts";
import { firstName, toE164 } from "./util.ts";

export type EscalationReason = "low_confidence" | "guardrail" | "customer_request" | "tool_failure" | "llm_outage" | "emergency" | "spend_cap" | "complaint" | "abuse";

const DONE_WORDS = /^(done|resolved|finished|close|closed)\.?$/i;

export function staffByPhone(ctx: Ctx, phone: string | null): { name: string; phone: string } | null {
  if (!phone) return null;
  const p = toE164(phone) ?? phone;
  return ctx.client.config.escalation.staff.find((s) => s.phone === p) ?? null;
}

function customerLabel(contact: ContactRow): string {
  return [contact.name, contact.phone ?? contact.email].filter(Boolean).join(" · ") || "Website visitor";
}

function pauseUntil(ctx: Ctx): string {
  const minutes = ctx.client.config.escalation.ai_pause_minutes ?? 120;
  return new Date(ctx.now().getTime() + minutes * 60_000).toISOString();
}

async function telegramBot(ctx: Ctx): Promise<TelegramBot> {
  const ref = ctx.client.config.escalation.credential;
  if (!ref) throw new Error("escalation.credential (telegram bot) is required for channel telegram");
  const { bot_token } = await getJsonSecret<{ bot_token: string }>(ctx.deps.secrets, ref);
  return new TelegramBot(bot_token, ctx.deps.fetchFn);
}

export async function openEscalation(ctx: Ctx, thread: ThreadRow, contact: ContactRow, input: {
  reason: EscalationReason; summary: string; urgent?: boolean;
}): Promise<EscalationRow> {
  const existing = await ctx.store.findOpenEscalationForThread(thread.id);
  if (existing) return existing;
  const esc = await ctx.store.insertEscalation({
    client_id: ctx.client.id, thread_id: thread.id, reason: input.reason, summary: input.summary.slice(0, 1000),
    claim_code: String(Math.floor(1000 + Math.random() * 9000)),
  });
  Object.assign(thread, await ctx.store.updateThread(thread.id, { status: "human", ai_paused_until: pauseUntil(ctx) }));
  await notifyStaff(ctx, esc, contact, input.urgent ?? false);
  await ctx.deps.events.emit(ctx.client, "escalation.opened", { escalation_id: esc.id, reason: esc.reason, summary: esc.summary });
  return esc;
}

async function notifyStaff(ctx: Ctx, esc: EscalationRow, contact: ContactRow, urgent: boolean): Promise<void> {
  const cfg = ctx.client.config.escalation;
  const head = `${urgent ? "URGENT: " : ""}${customerLabel(contact)} needs a person`;
  const body = `${head}\n${esc.summary}`;
  switch (cfg.channel) {
    case "telegram": {
      if (!cfg.telegram_chat_id) throw new Error("escalation.telegram_chat_id is required");
      const bot = await telegramBot(ctx);
      await bot.sendMessage(cfg.telegram_chat_id, `${body}\n\nTap to take it, then reply to this chat to answer the customer.`,
        [{ text: "I'll take it", callback_data: `claim:${esc.id}` }]);
      return;
    }
    case "whatsapp_staff": {
      const template = ctx.client.config.channels.whatsapp?.templates?.escalation_alert;
      for (const s of cfg.staff) {
        const ok = template
          ? await notifyPhone(ctx, s.phone, body, { via: "whatsapp", template: { name: template, bodyParams: [head, esc.summary.slice(0, 900)], quickReplyPayloads: [`claim:${esc.id}`] } })
          : false;
        // No template (or WhatsApp failed): SMS with a claim code.
        if (!ok) await notifyPhone(ctx, s.phone, `${body}\nReply TAKE ${esc.claim_code} to take it.`, { via: "sms" });
      }
      return;
    }
    case "sms":
      for (const s of cfg.staff) await notifyPhone(ctx, s.phone, `${body}\nReply TAKE ${esc.claim_code} to take it.`, { via: "sms" });
  }
}

export type ClaimOutcome = { status: "claimed"; escalation: EscalationRow } | { status: "already_claimed"; by: string | null } | { status: "not_found" };

export async function claimEscalation(ctx: Ctx, ref: { id?: string; code?: string }, staff: { id: string; name: string; replyVia?: "whatsapp" | "sms" }): Promise<ClaimOutcome> {
  const target = ref.id ? await ctx.store.getEscalation(ref.id) : ref.code ? await ctx.store.findEscalationByCode(ctx.client.id, ref.code) : null;
  if (!target || target.client_id !== ctx.client.id) return { status: "not_found" };
  const claimed = await ctx.store.claimEscalation(target.id, staff.id, staff.name, ctx.now().toISOString());
  if (!claimed) {
    const current = await ctx.store.getEscalation(target.id);
    return { status: "already_claimed", by: current?.claimed_by_name ?? null };
  }
  const thread = await ctx.store.getThread(claimed.thread_id);
  const contact = thread ? await ctx.store.getContact(thread.contact_id) : null;
  if (thread && contact) {
    Object.assign(thread, await ctx.store.updateThread(thread.id, { status: "human", ai_paused_until: pauseUntil(ctx) }));
    await sendToThread(ctx, thread, contact, `${firstName(staff.name) || "A team member"} from the team is looking at this now.`, { author: "system", noDisclosure: true });
    if (staff.replyVia) {
      const recent = (await ctx.store.listThreadMessages(thread.id, 6))
        .map((m) => `${m.author === "customer" ? "Customer" : m.author === "staff" ? "Staff" : "Assistant"}: ${m.body ?? ""}`).join("\n");
      await notifyPhone(ctx, staff.id, `You've got it. Recent messages:\n${recent}\n\nReply here and I'll pass it to ${contact.name ?? "the customer"}. Send DONE when finished.`, { via: staff.replyVia });
    }
  }
  await ctx.deps.events.emit(ctx.client, "escalation.claimed", { escalation_id: claimed.id, by: staff.name });
  return { status: "claimed", escalation: claimed };
}

/** A message from a staff member's phone: claim command, DONE, or a reply to relay to the customer. */
export async function handleStaffMessage(ctx: Ctx, staff: { id: string; name: string }, text: string, replyVia: "whatsapp" | "sms"): Promise<void> {
  const take = text.trim().match(/^take\s+(\d{4})$/i);
  if (take) {
    const res = await claimEscalation(ctx, { code: take[1] }, { ...staff, replyVia });
    if (res.status === "already_claimed") await notifyPhone(ctx, staff.id, `Already taken by ${res.by ?? "someone else"}.`, { via: replyVia });
    if (res.status === "not_found") await notifyPhone(ctx, staff.id, `No open request with code ${take[1]}.`, { via: replyVia });
    return;
  }
  const esc = await ctx.store.findActiveClaimForStaff(ctx.client.id, staff.id);
  if (!esc) {
    await notifyPhone(ctx, staff.id, "No conversation is assigned to you right now. Tap \"I'll take it\" on an alert first.", { via: replyVia });
    return;
  }
  const thread = await ctx.store.getThread(esc.thread_id);
  const contact = thread ? await ctx.store.getContact(thread.contact_id) : null;
  if (!thread || !contact) return;
  if (DONE_WORDS.test(text.trim())) {
    await resolveEscalation(ctx, esc, thread);
    await notifyPhone(ctx, staff.id, "Closed. The assistant will handle new messages on that conversation.", { via: replyVia });
    return;
  }
  await relayStaffReply(ctx, esc, thread, contact, staff, text);
}

export async function relayStaffReply(ctx: Ctx, esc: EscalationRow, thread: ThreadRow, contact: ContactRow, staff: { name: string }, text: string) {
  const res = await sendToThread(ctx, thread, contact, text, { author: "staff", noDisclosure: true, metadata: { staff: staff.name, escalation_id: esc.id } });
  Object.assign(thread, await ctx.store.updateThread(thread.id, { status: "human", ai_paused_until: pauseUntil(ctx) }));
  return res;
}

export async function resolveEscalation(ctx: Ctx, esc: EscalationRow, thread: ThreadRow): Promise<void> {
  await ctx.store.updateEscalation(esc.id, { status: "resolved", resolved_at: ctx.now().toISOString() });
  Object.assign(thread, await ctx.store.updateThread(thread.id, { status: "ai", ai_paused_until: null }));
}

/** Customer wrote while a person owns the thread: pass it to them instead of the AI answering. */
export async function forwardToClaimer(ctx: Ctx, esc: EscalationRow, contact: ContactRow, text: string): Promise<void> {
  if (esc.status !== "claimed" || !esc.claimed_by) return;
  const line = `${contact.name ?? contact.phone ?? "Customer"}: ${text}`;
  if (esc.claimed_by.startsWith("tg:")) {
    const chat = ctx.client.config.escalation.telegram_chat_id;
    if (chat) await (await telegramBot(ctx)).sendMessage(chat, `${line}\n(for ${esc.claimed_by_name ?? "the claimer"})`);
    return;
  }
  await notifyPhone(ctx, esc.claimed_by, line, { via: staffChannel(ctx) });
}

/** Scheduled: owner backup ping after claim_timeout, expiry after ai_pause_minutes. */
export async function escalationTimeouts(ctx: Ctx): Promise<{ ownerPinged: number; expired: number }> {
  const cfg = ctx.client.config.escalation;
  const now = ctx.now().getTime();
  let ownerPinged = 0;
  let expired = 0;
  for (const esc of await ctx.store.listOpenEscalations(ctx.client.id)) {
    const age = (now - new Date(esc.created_at).getTime()) / 60_000;
    const thread = await ctx.store.getThread(esc.thread_id);
    if (!thread) continue;
    if (esc.status === "open" && !esc.owner_notified_at && cfg.owner_backup && age >= (cfg.claim_timeout_minutes ?? 10)) {
      const contact = await ctx.store.getContact(thread.contact_id);
      await notifyPhone(ctx, cfg.owner_backup, `Nobody has taken this yet (${Math.round(age)} min): ${contact ? customerLabel(contact) : "customer"}: ${esc.summary}\nReply TAKE ${esc.claim_code} to take it.`, { via: "sms" });
      await ctx.store.updateEscalation(esc.id, { owner_notified_at: ctx.now().toISOString() });
      ownerPinged++;
    }
    const pausedOut = !thread.ai_paused_until || new Date(thread.ai_paused_until).getTime() <= now;
    if (esc.status === "open" && age >= (cfg.ai_pause_minutes ?? 120)) {
      await ctx.store.updateEscalation(esc.id, { status: "expired" });
      Object.assign(thread, await ctx.store.updateThread(thread.id, { status: "ai", ai_paused_until: null }));
      const contact = await ctx.store.getContact(thread.contact_id);
      if (contact) {
        await sendToThread(ctx, thread, contact,
          `Sorry for the wait. The team couldn't get to this yet and will contact you during opening hours (${ctx.client.config.business.phone}). I can still help with bookings and questions in the meantime.`,
          { author: "system", noDisclosure: true });
      }
      expired++;
    } else if (esc.status === "claimed" && pausedOut) {
      await resolveEscalation(ctx, esc, thread);   // claimer went quiet past the pause window: hand back to the AI
    }
  }
  return { ownerPinged, expired };
}
