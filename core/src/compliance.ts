// Messaging compliance (spec §8): STOP/START, AI disclosure, the WhatsApp 24-hour window, marketing consent.
import type { ClientConfig } from "./config/index.ts";
import type { ContactRow, ThreadRow } from "./store/types.ts";

const START_WORDS = ["START", "UNSTOP", "SUBSCRIBE", "RESUME"];

const normalise = (text: string) => text.trim().replace(/[.!\s]+$/g, "").toUpperCase();

/** STOP keywords match the whole message only: "cancel my appointment" is a booking request, "CANCEL" is an opt-out. */
export function isStopMessage(config: ClientConfig, text: string): boolean {
  const msg = normalise(text);
  return config.compliance.stop_keywords.some((k) => k.toUpperCase() === msg);
}

export function isStartMessage(text: string): boolean {
  return START_WORDS.includes(normalise(text));
}

/** WhatsApp free-form replies are only allowed within 24h of the customer's last message. */
export function inWhatsAppWindow(thread: ThreadRow, now: Date): boolean {
  if (!thread.last_inbound_at) return false;
  return now.getTime() - new Date(thread.last_inbound_at).getTime() < 24 * 3600_000;
}

/** Marketing / nurture sends need recorded consent and no opt-out. Transactional messages don't. */
export function canSendMarketing(contact: ContactRow): boolean {
  return !!contact.consent_marketing_at && !contact.opted_out_at;
}

export function stopReply(config: ClientConfig): string {
  return config.compliance.stop_reply ?? `You're unsubscribed from ${config.name} messages. Reply START to opt back in.`;
}

export function startReply(config: ClientConfig): string {
  return `You're subscribed again to messages from ${config.name}. Reply STOP any time to opt out.`;
}
