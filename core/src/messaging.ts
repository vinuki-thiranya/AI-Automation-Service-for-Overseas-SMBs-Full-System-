// The single path for anything sent to a customer: disclosure on the first assistant message,
// the WhatsApp 24h window, transcript logging and thread bookkeeping.
import type { OutboundMessage } from "./channels/index.ts";
import { inWhatsAppWindow } from "./compliance.ts";
import type { Ctx } from "./context.ts";
import type { Channel, ContactRow, MessageRow, ThreadRow } from "./store/types.ts";
import { errorMessage } from "./util.ts";

export interface SendOptions {
  author?: MessageRow["author"];
  template?: OutboundMessage["template"];
  buttons?: OutboundMessage["buttons"];
  subject?: string;
  html?: string;
  attachments?: OutboundMessage["attachments"];
  metadata?: Record<string, unknown>;
  /** Skip the AI disclosure prefix (staff relays, STOP confirmations). */
  noDisclosure?: boolean;
}

export interface SendOutcome {
  sent: boolean;
  text: string;            // what the customer actually received (with disclosure)
  reason?: string;
  message?: MessageRow;
}

export function recipientFor(thread: ThreadRow, contact: ContactRow, channel: Channel = thread.channel): string | null {
  switch (channel) {
    case "whatsapp": case "sms": case "voice": return contact.phone;
    case "email": return contact.email;
    case "webchat": return thread.state.webchat_session ?? null;
  }
}

export async function sendToThread(ctx: Ctx, thread: ThreadRow, contact: ContactRow, text: string, opts: SendOptions = {}): Promise<SendOutcome> {
  const { client, store } = ctx;
  const author = opts.author ?? "assistant";
  const channel: Channel = thread.channel === "voice" ? "sms" : thread.channel;
  const to = recipientFor(thread, contact, channel);
  if (!to) return { sent: false, text, reason: `no ${channel} address for contact` };

  const disclose = author === "assistant" && !thread.disclosed_at && !opts.noDisclosure;
  const body = disclose ? `${client.config.assistant.disclosure_text}\n\n${text}` : text;

  if (channel === "whatsapp" && !opts.template && !inWhatsAppWindow(thread, ctx.now())) {
    return { sent: false, text: body, reason: "outside WhatsApp 24h window and no template given" };
  }

  let providerMessageId: string | null = null;
  try {
    const res = await ctx.deps.channels.send(client, {
      channel, to, text: body, template: opts.template, buttons: opts.buttons,
      subject: opts.subject, html: opts.html, attachments: opts.attachments,
    });
    providerMessageId = res.providerMessageId;
  } catch (err) {
    await ctx.deps.alerts.recordFailure(client, `send ${channel}`, err);
    await store.insertMessage({
      client_id: client.id, thread_id: thread.id, direction: "outbound", author, channel, body,
      metadata: { ...opts.metadata, send_error: errorMessage(err) },
    });
    return { sent: false, text: body, reason: errorMessage(err) };
  }

  const nowIso = ctx.now().toISOString();
  const { message } = await store.insertMessage({
    client_id: client.id, thread_id: thread.id, direction: "outbound", author, channel, body,
    provider_message_id: providerMessageId,
    metadata: { ...opts.metadata, ...(opts.template ? { template: opts.template.name } : {}) },
  });
  const patch: Partial<ThreadRow> = { last_message_at: nowIso };
  if (disclose) patch.disclosed_at = nowIso;
  Object.assign(thread, await store.updateThread(thread.id, patch));
  return { sent: true, text: body, message };
}

/** Message to a staff member or owner phone (not a customer thread): WhatsApp template or SMS. */
export async function notifyPhone(ctx: Ctx, phone: string, text: string, opts: { via: "whatsapp" | "sms"; template?: OutboundMessage["template"] }): Promise<boolean> {
  try {
    await ctx.deps.channels.send(ctx.client, { channel: opts.via, to: phone, text, template: opts.via === "whatsapp" ? opts.template : undefined });
    return true;
  } catch (err) {
    await ctx.deps.alerts.recordFailure(ctx.client, `notify ${opts.via}`, err);
    return false;
  }
}

/** Channel used for staff/owner notifications: WhatsApp when the client has it, else SMS. */
export function staffChannel(ctx: Ctx): "whatsapp" | "sms" {
  const esc = ctx.client.config.escalation.channel;
  if (esc === "sms") return "sms";
  return ctx.client.config.channels.whatsapp?.enabled ? "whatsapp" : "sms";
}
