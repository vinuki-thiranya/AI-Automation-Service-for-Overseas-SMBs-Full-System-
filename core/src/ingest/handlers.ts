// Routes normalized inbound events: staff vs customer, dedupe, contact merge, thread reuse, then the engine.
import type { Ctx } from "../context.ts";
import { handleCustomerMessage, type TurnResult } from "../engine/conversation.ts";
import { claimEscalation, handleStaffMessage, relayStaffReply, resolveEscalation, staffByPhone } from "../escalation.ts";
import { leadConfig, startLeadFlow, syncLeadToCrm } from "../leads.ts";
import { sendToThread } from "../messaging.ts";
import { getJsonSecret } from "../secrets.ts";
import type { Channel, ContactRow, ThreadRow } from "../store/types.ts";
import { TelegramBot } from "../telegram.ts";
import { KeyedMutex, firstName, toE164 } from "../util.ts";
import type { InboundMessage, TelegramUpdate } from "./normalize.ts";

const THREAD_REUSE_DAYS = 7;
const turnLock = new KeyedMutex();

/** Paused or offboarded: messages are still recorded (nothing is lost, the dashboard shows them), but nothing
 *  is sent, so the clinic's own handling takes over. Scheduled jobs already skip these clients. */
export const isSilenced = (ctx: Ctx) => ctx.client.status === "paused" || ctx.client.status === "offboarded";

export async function resolveContact(ctx: Ctx, channel: Channel, externalId: string, hints: { phone?: string | null; email?: string | null; name?: string | null }): Promise<ContactRow> {
  const { store, client } = ctx;
  let contact = await store.findContactByChannel(client.id, channel, externalId);
  if (!contact && hints.phone) contact = await store.findContactByPhone(client.id, hints.phone);
  if (!contact && hints.email) contact = await store.findContactByEmail(client.id, hints.email);
  if (!contact) {
    contact = await store.insertContact({ client_id: client.id, phone: hints.phone ?? null, email: hints.email?.toLowerCase() ?? null, name: hints.name ?? null });
  } else {
    // Fill gaps only; the CRM is the source of truth for contact details (spec §4.5).
    const patch: Partial<ContactRow> = {};
    if (!contact.phone && hints.phone) patch.phone = hints.phone;
    if (!contact.email && hints.email) patch.email = hints.email.toLowerCase();
    if (!contact.name && hints.name) patch.name = hints.name;
    if (Object.keys(patch).length) contact = await store.updateContact(contact.id, patch);
  }
  await store.linkChannel(client.id, channel, externalId, contact.id);
  return contact;
}

export async function resolveThread(ctx: Ctx, contact: ContactRow, channel: Channel): Promise<ThreadRow> {
  const latest = await ctx.store.findLatestThread(ctx.client.id, contact.id, channel);
  const fresh = latest && latest.status !== "closed" &&
    ctx.now().getTime() - new Date(latest.last_message_at).getTime() < THREAD_REUSE_DAYS * 86_400_000;
  return fresh ? latest : ctx.store.insertThread({ client_id: ctx.client.id, contact_id: contact.id, channel });
}

export interface InboundOutcome {
  duplicate: boolean;
  staff: boolean;
  turn?: TurnResult;
}

/** One inbound customer or staff message. Serialized per sender so rapid messages are handled in order. */
export async function handleInbound(ctx: Ctx, msg: InboundMessage): Promise<InboundOutcome> {
  return turnLock.run(`${ctx.client.id}|${msg.channel}|${msg.externalId}`, async () => {
    // Staff phones never get the AI: claims, DONE and relays.
    const staff = msg.channel === "whatsapp" || msg.channel === "sms" ? staffByPhone(ctx, msg.phone) : null;
    if (staff) {
      const claim = msg.buttonPayload?.match(/^claim:([0-9a-f-]{36})$/);
      if (claim) await claimEscalation(ctx, { id: claim[1] }, { id: staff.phone, name: staff.name, replyVia: msg.channel === "whatsapp" ? "whatsapp" : "sms" });
      else if (msg.text) await handleStaffMessage(ctx, { id: staff.phone, name: staff.name }, msg.text, msg.channel === "whatsapp" ? "whatsapp" : "sms");
      return { duplicate: false, staff: true };
    }

    const contact = await resolveContact(ctx, msg.channel, msg.externalId, { phone: msg.phone, email: msg.email, name: msg.name });
    const thread = await resolveThread(ctx, contact, msg.channel);
    if (msg.channel === "webchat" && thread.state.webchat_session !== msg.externalId) {
      thread.state = { ...thread.state, webchat_session: msg.externalId };
      await ctx.store.updateThread(thread.id, { state: thread.state });
    }
    const { message, duplicate } = await ctx.store.insertMessage({
      client_id: ctx.client.id, thread_id: thread.id, direction: "inbound", author: "customer", channel: msg.channel,
      provider_message_id: msg.providerMessageId, body: msg.text || null, attachments: msg.attachments, metadata: msg.metadata,
    });
    if (duplicate) return { duplicate: true, staff: false };
    Object.assign(thread, await ctx.store.updateThread(thread.id, { last_inbound_at: msg.timestamp, last_message_at: ctx.now().toISOString() }));

    if (isSilenced(ctx)) {
      await ctx.store.audit(ctx.client.id, "core:inbound", "client_paused_no_reply", { thread_id: thread.id, status: ctx.client.status });
      return { duplicate: false, staff: false };
    }
    if (!msg.text && msg.attachments.length) {
      // Media without text: acknowledge; document capture is Package C.
      const turn: TurnResult = { replies: [], handledBy: "ignored", escalated: false, toolCalls: [] };
      const res = await sendToThread(ctx, thread, contact, "Thanks, we've received your file. A team member will take a look.");
      turn.replies.push(res.text);
      return { duplicate: false, staff: false, turn };
    }
    const turn = await handleCustomerMessage(ctx, thread, contact, message);
    return { duplicate: false, staff: false, turn };
  });
}

/** Twilio voice webhook for a forwarded unanswered call: text back within seconds (spec §4.1). */
export async function handleMissedCall(ctx: Ctx, params: Record<string, string>): Promise<void> {
  const cfg = ctx.client.config;
  const phone = toE164(params.From);
  if (!phone || !cfg.channels.missed_call?.enabled || isSilenced(ctx)) return;
  const channel: Channel = cfg.channels.missed_call.text_back_channel === "whatsapp" ? "whatsapp" : "sms";
  if (!(await ctx.store.markOnce(ctx.client.id, `missed-call:${params.CallSid ?? `${phone}:${ctx.now().toISOString().slice(0, 16)}`}`))) return;
  const contact = await resolveContact(ctx, channel, channel === "whatsapp" ? phone.slice(1) : phone, { phone });
  if (contact.opted_out_at) return;
  const thread = await resolveThread(ctx, contact, channel);
  const greeting = contact.name ? `Hi ${firstName(contact.name)}, sorry` : "Sorry";
  const text = `${greeting} we missed your call to ${cfg.name}. I can book you in or answer questions here by text. What can I help with?`;
  const template = channel === "whatsapp" && cfg.channels.whatsapp?.templates?.missed_call ? { name: cfg.channels.whatsapp.templates.missed_call, bodyParams: [cfg.name] } : undefined;
  const res = await sendToThread(ctx, thread, contact, text, { template, metadata: { missed_call: params.CallSid ?? null } });
  await ctx.store.audit(ctx.client.id, "core:missed-call", res.sent ? "texted_back" : "text_back_failed", { contact_id: contact.id, reason: res.reason ?? null });
  if (res.sent) await ctx.deps.events.emit(ctx.client, "missed_call.texted", { contact_id: contact.id });
}

export interface LeadIntake {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  source?: string;
  consent_marketing?: boolean;
  answers?: Record<string, string>;
}

/** Web form / Zapier / Google Ads lead → contact, lead, first response within seconds (spec §4.4). */
export async function handleLeadIntake(ctx: Ctx, input: LeadIntake): Promise<{ lead_id: string; responded_via: Channel | null }> {
  const cfg = ctx.client.config;
  const phone = toE164(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  if (!phone && !email) throw new Error("lead needs a phone (E.164) or email");
  const receivedAt = ctx.now().toISOString();

  const channel: Channel | null = phone && cfg.channels.sms?.enabled ? "sms"
    : phone && cfg.channels.whatsapp?.enabled && cfg.channels.whatsapp.templates?.lead_followup ? "whatsapp"
    : email && cfg.channels.email?.enabled ? "email" : null;
  const contact = await resolveContact(ctx, channel ?? "email", channel === "whatsapp" ? phone!.slice(1) : (channel === "sms" ? phone! : email ?? phone!), { phone, email, name: input.name ?? null });
  if (input.consent_marketing && !contact.consent_marketing_at) {
    Object.assign(contact, await ctx.store.updateContact(contact.id, { consent_marketing_at: receivedAt }));
  }
  const thread = await resolveThread(ctx, contact, channel ?? "email");
  if (input.message) {
    await ctx.store.insertMessage({ client_id: ctx.client.id, thread_id: thread.id, direction: "inbound", author: "customer", channel: thread.channel, body: input.message, metadata: { lead_form: true } });
  }
  const { lead, question } = leadConfig(ctx)
    ? await startLeadFlow(ctx, thread, contact, { source: input.source ?? "web_form", answers: input.answers, receivedAt })
    : { lead: await ctx.store.insertLead({ client_id: ctx.client.id, contact_id: contact.id, thread_id: thread.id, source: input.source ?? "web_form", received_at: receivedAt }), question: null };

  if (!channel || contact.opted_out_at || isSilenced(ctx)) return { lead_id: lead.id, responded_via: null };
  const hello = `Hi ${firstName(contact.name) || "there"}, thanks for your enquiry with ${cfg.name}!`;
  const text = question ? `${hello} A couple of quick questions so we can help. ${question}` : `${hello} How can we help?`;
  const template = channel === "whatsapp" ? { name: cfg.channels.whatsapp!.templates!.lead_followup!, bodyParams: [firstName(contact.name) || "there", cfg.name] } : undefined;
  const res = await sendToThread(ctx, thread, contact, text, { template, subject: `Your enquiry with ${cfg.name}` });
  if (res.sent) await ctx.store.updateLead(lead.id, { first_response_at: ctx.now().toISOString() });
  if (!question) await syncLeadToCrm(ctx, lead, contact);
  return { lead_id: lead.id, responded_via: res.sent ? channel : null };
}

/** Telegram staff group: "I'll take it" callbacks and staff replies (relayed to the claimed customer). */
export async function handleTelegramUpdate(ctx: Ctx, update: TelegramUpdate): Promise<void> {
  const cfg = ctx.client.config.escalation;
  if (cfg.channel !== "telegram" || !cfg.credential) return;
  const { bot_token } = await getJsonSecret<{ bot_token: string }>(ctx.deps.secrets, cfg.credential);
  const bot = new TelegramBot(bot_token, ctx.deps.fetchFn);
  const cb = update.callback_query;
  if (cb) {
    const id = cb.data?.match(/^claim:([0-9a-f-]{36})$/)?.[1];
    if (!id || String(cb.message?.chat.id) !== cfg.telegram_chat_id) return;
    const name = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(" ") || "Staff";
    const res = await claimEscalation(ctx, { id }, { id: `tg:${cb.from.id}`, name });
    await bot.answerCallbackQuery(cb.id, res.status === "claimed" ? "It's yours. Reply in this chat to answer." : res.status === "already_claimed" ? `Already taken by ${res.by}` : "No longer open");
    if (res.status === "claimed" && cb.message) await bot.editMessageText(cfg.telegram_chat_id!, cb.message.message_id, `${cb.message.text ?? ""}\n\nTaken by ${name}`);
    return;
  }
  const m = update.message;
  if (!m?.text || !m.from || m.from.is_bot || String(m.chat.id) !== cfg.telegram_chat_id) return;
  const esc = await ctx.store.findActiveClaimForStaff(ctx.client.id, `tg:${m.from.id}`);
  if (!esc) return;   // ordinary group chatter
  const thread = await ctx.store.getThread(esc.thread_id);
  const contact = thread ? await ctx.store.getContact(thread.contact_id) : null;
  if (!thread || !contact) return;
  if (/^(done|resolved|closed?)\.?$/i.test(m.text.trim())) {
    await resolveEscalation(ctx, esc, thread);
    await bot.sendMessage(cfg.telegram_chat_id!, "Closed. The assistant will handle new messages on that conversation.");
    return;
  }
  await relayStaffReply(ctx, esc, thread, contact, { name: m.from.first_name ?? "Staff" }, m.text);
}
