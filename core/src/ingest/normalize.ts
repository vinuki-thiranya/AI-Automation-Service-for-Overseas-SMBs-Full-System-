// Provider payloads → one inbound shape (spec §4.1: {channel, contact_id, text, attachments, timestamp, metadata}).
import type { Channel } from "../store/types.ts";
import { toE164 } from "../util.ts";

export interface InboundMessage {
  channel: Channel;
  externalId: string;               // wa_id, phone, webchat session, email
  providerMessageId: string | null;
  text: string;
  timestamp: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  attachments: { type: string; id?: string; url?: string; mime?: string }[];
  /** WhatsApp quick-reply / interactive button payload (e.g. "claim:<escalation id>"). */
  buttonPayload: string | null;
  metadata: Record<string, unknown>;
}

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { payload?: string; text?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

interface WaChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: { id: string; status: string; recipient_id: string; errors?: { code: number; title: string }[] }[];
}

export interface WaStatus {
  providerMessageId: string;
  status: string;
  errors: { code: number; title: string }[];
}

/** Returns messages for this phone_number_id only (one Meta app can serve many numbers). */
export function parseWhatsApp(body: unknown, phoneNumberId: string | undefined): { messages: InboundMessage[]; statuses: WaStatus[] } {
  const messages: InboundMessage[] = [];
  const statuses: WaStatus[] = [];
  const entries = (body as { entry?: { changes?: { value?: WaChangeValue }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v || (phoneNumberId && v.metadata?.phone_number_id !== phoneNumberId)) continue;
      for (const s of v.statuses ?? []) statuses.push({ providerMessageId: s.id, status: s.status, errors: s.errors ?? [] });
      for (const m of v.messages ?? []) {
        const profile = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        const attachments: InboundMessage["attachments"] = [];
        let text = "";
        let buttonPayload: string | null = null;
        switch (m.type) {
          case "text": text = m.text?.body ?? ""; break;
          case "button": text = m.button?.text ?? ""; buttonPayload = m.button?.payload ?? null; break;
          case "interactive": {
            const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
            text = r?.title ?? ""; buttonPayload = r?.id ?? null; break;
          }
          case "image": attachments.push({ type: "image", id: m.image?.id, mime: m.image?.mime_type }); text = m.image?.caption ?? ""; break;
          case "document": attachments.push({ type: "document", id: m.document?.id, mime: m.document?.mime_type }); text = m.document?.caption ?? ""; break;
          case "audio": attachments.push({ type: "audio", id: m.audio?.id, mime: m.audio?.mime_type }); break;
          case "location": text = [m.location?.name, m.location?.address].filter(Boolean).join(", ") || "(shared a location)"; break;
          default: text = "";
        }
        messages.push({
          channel: "whatsapp", externalId: m.from, providerMessageId: m.id, text,
          timestamp: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
          name: profile, phone: toE164(`+${m.from}`), email: null, attachments, buttonPayload,
          metadata: { wa_type: m.type },
        });
      }
    }
  }
  return { messages, statuses };
}

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded). */
export function parseTwilioSms(params: Record<string, string>, now: Date): InboundMessage {
  const media = Number(params.NumMedia ?? 0);
  const attachments: InboundMessage["attachments"] = [];
  for (let i = 0; i < media; i++) attachments.push({ type: "media", url: params[`MediaUrl${i}`], mime: params[`MediaContentType${i}`] });
  const phone = toE164(params.From);
  return {
    channel: "sms", externalId: phone ?? params.From ?? "unknown", providerMessageId: params.MessageSid ?? params.SmsSid ?? null,
    text: params.Body ?? "", timestamp: now.toISOString(), name: null, phone, email: null, attachments, buttonPayload: null,
    metadata: { to: params.To },
  };
}

/** Telegram update (staff escalation group). */
export interface TelegramUpdate {
  callback_query?: { id: string; from: { id: number; first_name?: string; last_name?: string }; data?: string; message?: { message_id: number; chat: { id: number }; text?: string } };
  message?: { message_id: number; from?: { id: number; first_name?: string; last_name?: string; is_bot?: boolean }; chat: { id: number }; text?: string; reply_to_message?: { message_id: number } };
}
