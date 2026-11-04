// Outbound messaging. Each sender takes a normalized OutboundMessage and returns the provider id.
import type { Client } from "../config/index.ts";
import type { AppEnv } from "../env.ts";
import type { SecretResolver } from "../secrets.ts";
import { getJsonSecret } from "../secrets.ts";
import type { Channel } from "../store/types.ts";
import { basicAuth, requestJson, type FetchLike } from "../util.ts";

export interface OutboundMessage {
  channel: Channel;
  to: string;                       // E.164 phone, wa_id, email address, webchat session or telegram chat id
  text: string;
  /** WhatsApp template (required outside the 24h window). Body params fill {{1}}, {{2}}... */
  template?: { name: string; language?: string; bodyParams?: string[]; quickReplyPayloads?: string[] };
  /** WhatsApp interactive reply buttons (inside the 24h window). */
  buttons?: { id: string; title: string }[];
  subject?: string;                 // email
  html?: string;                    // email
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
}

export interface SendResult {
  providerMessageId: string | null;
}

export interface ChannelSender {
  send(client: Client, msg: OutboundMessage): Promise<SendResult>;
}

/** Webchat has no push channel: messages wait here until the widget polls (or are returned inline). */
export class WebchatOutbox {
  private readonly queues = new Map<string, { text: string; at: string }[]>();
  push(session: string, text: string, at: string) {
    const q = this.queues.get(session) ?? [];
    q.push({ text, at });
    this.queues.set(session, q.slice(-50));
  }
  drain(session: string): { text: string; at: string }[] {
    const q = this.queues.get(session) ?? [];
    this.queues.delete(session);
    return q;
  }
}

export class LiveChannels implements ChannelSender {
  private readonly env: AppEnv;
  private readonly secrets: SecretResolver;
  private readonly fetchFn: FetchLike;
  readonly webchat: WebchatOutbox;

  constructor(env: AppEnv, secrets: SecretResolver, webchat: WebchatOutbox, fetchFn: FetchLike = fetch) {
    this.env = env;
    this.secrets = secrets;
    this.webchat = webchat;
    this.fetchFn = fetchFn;
  }

  async send(client: Client, msg: OutboundMessage): Promise<SendResult> {
    switch (msg.channel) {
      case "whatsapp": return this.whatsapp(client, msg);
      case "sms": case "voice": return this.sms(client, msg);
      case "email": return this.email(client, msg);
      case "webchat":
        this.webchat.push(msg.to, msg.text, new Date().toISOString());
        return { providerMessageId: null };
    }
  }

  private async whatsapp(client: Client, msg: OutboundMessage): Promise<SendResult> {
    const wa = client.config.channels.whatsapp;
    if (!wa?.enabled || !wa.phone_number_id || !wa.credential) throw new Error("whatsapp channel not configured");
    const token = await this.secrets.get(wa.credential);
    const to = msg.to.replace(/^\+/, "");
    let body: Record<string, unknown>;
    if (msg.template) {
      const components: Record<string, unknown>[] = [];
      if (msg.template.bodyParams?.length) {
        components.push({ type: "body", parameters: msg.template.bodyParams.map((text) => ({ type: "text", text })) });
      }
      msg.template.quickReplyPayloads?.forEach((payload, index) => {
        components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] });
      });
      body = {
        messaging_product: "whatsapp", to, type: "template",
        template: { name: msg.template.name, language: { code: msg.template.language ?? localeToWaLanguage(client.config.locale) }, components },
      };
    } else if (msg.buttons?.length) {
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: {
          type: "button",
          body: { text: msg.text.slice(0, 1024) },
          action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
        },
      };
    } else {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: msg.text, preview_url: true } };
    }
    const res = await requestJson<{ messages?: { id: string }[] }>(this.fetchFn,
      `https://graph.facebook.com/${this.env.whatsappGraphVersion}/${wa.phone_number_id}/messages`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, json: body });
    return { providerMessageId: res.messages?.[0]?.id ?? null };
  }

  private async sms(client: Client, msg: OutboundMessage): Promise<SendResult> {
    const sms = client.config.channels.sms;
    if (!sms?.enabled || !sms.from_number || !sms.credential) throw new Error("sms channel not configured");
    const { account_sid, auth_token } = await getJsonSecret<{ account_sid: string; auth_token: string }>(this.secrets, sms.credential);
    const form = new URLSearchParams({ To: msg.to, From: sms.from_number, Body: msg.text });
    const res = await requestJson<{ sid?: string }>(this.fetchFn,
      `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
      {
        method: "POST",
        headers: { Authorization: basicAuth(account_sid, auth_token), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    return { providerMessageId: res.sid ?? null };
  }

  private async email(client: Client, msg: OutboundMessage): Promise<SendResult> {
    const email = client.config.channels.email;
    if (!email?.enabled || !email.from_address || !email.credential) throw new Error("email channel not configured");
    const key = await this.secrets.get(email.credential);
    const res = await requestJson<{ id?: string }>(this.fetchFn, "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      json: {
        from: `${client.config.name} <${email.from_address}>`,
        to: [msg.to],
        subject: msg.subject ?? client.config.name,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.attachments?.length
          ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.contentBase64, content_type: a.contentType })) }
          : {}),
      },
    });
    return { providerMessageId: res.id ?? null };
  }
}

function localeToWaLanguage(locale: string): string {
  return locale.replace("-", "_"); // en-AU → en_AU (Meta template language codes)
}

/** Records every outbound message instead of sending it (tests and QA). */
export class CaptureChannels implements ChannelSender {
  readonly sent: { clientSlug: string; msg: OutboundMessage }[] = [];
  failChannels = new Set<Channel>();

  async send(client: Client, msg: OutboundMessage): Promise<SendResult> {
    if (this.failChannels.has(msg.channel)) throw new Error(`${msg.channel} send failed (simulated)`);
    this.sent.push({ clientSlug: client.slug, msg });
    return { providerMessageId: `captured-${this.sent.length}` };
  }

  to(recipient: string): OutboundMessage[] {
    return this.sent.filter((s) => s.msg.to === recipient).map((s) => s.msg);
  }
}
