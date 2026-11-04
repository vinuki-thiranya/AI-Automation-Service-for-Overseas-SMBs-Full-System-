// Rows mirror supabase/migrations/*.sql. Timestamps are ISO strings (UTC).
import type { Client } from "../config/index.ts";

export type Channel = "whatsapp" | "sms" | "webchat" | "email" | "voice";

export interface ContactRow {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  crm_external_id: string | null;
  consent_marketing_at: string | null;
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferedSlot {
  slot_id: string;
  start: string;            // ISO with offset, client timezone
  end: string;
  service_id: string;
  practitioner_id: string | null;
  practitioner: string | null;
  label: string;            // "Tue 11 Nov, 10:30am with Dr Maya Chen"
}

export interface LeadFlowState {
  lead_id: string;
  step: number;             // index into lead_qualification.questions
  asked_at: string;
}

export interface ThreadState {
  offered_slots?: OfferedSlot[];
  offered_at?: string;
  lead?: LeadFlowState;
  rate_limit_notified_at?: string;
  abuse_count?: number;
  webchat_session?: string;
}

export interface ThreadRow {
  id: string;
  client_id: string;
  contact_id: string;
  channel: Channel;
  status: "ai" | "human" | "closed";
  ai_paused_until: string | null;
  summary: string | null;
  disclosed_at: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
  state: ThreadState;
  created_at: string;
}

export interface MessageRow {
  id: string;
  client_id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  author: "customer" | "assistant" | "staff" | "system";
  channel: Channel;
  provider_message_id: string | null;
  body: string | null;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export type BookingStatus = "booked" | "rescheduled" | "cancelled" | "attended" | "no_show";

export interface BookingRow {
  id: string;
  client_id: string;
  contact_id: string | null;
  thread_id: string | null;
  adapter: string;
  external_booking_id: string;
  service_id: string | null;
  practitioner: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  reminders_sent: string[];
  created_at: string;
  updated_at: string;
}

export type LeadGrade = "hot" | "warm" | "cold";

export interface LeadRow {
  id: string;
  client_id: string;
  contact_id: string | null;
  thread_id: string | null;
  source: string;
  answers: Record<string, string>;
  rule_score: number | null;
  llm_score: number | null;
  score: number | null;
  grade: LeadGrade | null;
  status: "new" | "qualifying" | "booked" | "nurturing" | "won" | "lost" | "archived";
  received_at: string;
  first_response_at: string | null;
  crm_external_id: string | null;
  nurture_step: number;
  next_nurture_at: string | null;
  nurture_stopped_at: string | null;
  created_at: string;
}

export interface EscalationRow {
  id: string;
  client_id: string;
  thread_id: string;
  reason: string;
  summary: string;
  status: "open" | "claimed" | "resolved" | "expired";
  claim_code: string;
  claimed_by: string | null;       // staff phone or telegram user id
  claimed_by_name: string | null;
  owner_notified_at: string | null;
  created_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
}

export interface UsageRow {
  client_id: string;
  provider: string;
  kind: string;
  model: string | null;
  units: number;
  cost_usd: number;
  occurred_at?: string;
}

export interface MetricsDailyRow {
  client_id: string;
  day: string;                     // YYYY-MM-DD in the client's timezone
  enquiries: number;
  conversations: number;
  bookings: number;
  cancellations: number;
  leads_hot: number;
  leads_warm: number;
  leads_cold: number;
  escalations: number;
  missed_calls_texted: number;
  median_response_seconds: number | null;
  p95_response_seconds: number | null;
  speed_to_lead_seconds: number | null;
  revenue_influenced: number;
  revenue_currency: string | null;
  llm_cost_usd: number;
  messaging_cost_usd: number;
}

export interface FaqMatch {
  id: string;
  source: string;
  content: string;
  similarity: number;
}

type Insert<T, Optional extends keyof T> = Omit<T, Optional | "id" | "created_at"> & Partial<Pick<T, Optional>>;

export type NewContact = Insert<ContactRow, "name" | "phone" | "email" | "language" | "crm_external_id" | "consent_marketing_at" | "opted_out_at" | "updated_at">;
export type NewThread = Insert<ThreadRow, "status" | "ai_paused_until" | "summary" | "disclosed_at" | "last_inbound_at" | "last_message_at" | "state">;
export type NewMessage = Insert<MessageRow, "provider_message_id" | "attachments" | "metadata" | "body">;
export type NewBooking = Insert<BookingRow, "contact_id" | "thread_id" | "service_id" | "practitioner" | "status" | "reminders_sent" | "updated_at">;
export type NewLead = Insert<LeadRow, "contact_id" | "thread_id" | "answers" | "rule_score" | "llm_score" | "score" | "grade" | "status" | "received_at" | "first_response_at" | "crm_external_id" | "nurture_step" | "next_nurture_at" | "nurture_stopped_at">;
export type NewEscalation = Insert<EscalationRow, "status" | "claimed_by" | "claimed_by_name" | "owner_notified_at" | "claimed_at" | "resolved_at">;

/** Persistence used by every module. SupabaseStore in production, MemoryStore in tests and QA. */
export interface Store {
  getClientBySlug(slug: string): Promise<Client | null>;
  listActiveClients(): Promise<Client[]>;

  getContact(id: string): Promise<ContactRow | null>;
  findContactByChannel(clientId: string, channel: Channel, externalId: string): Promise<ContactRow | null>;
  findContactByPhone(clientId: string, phone: string): Promise<ContactRow | null>;
  findContactByEmail(clientId: string, email: string): Promise<ContactRow | null>;
  insertContact(row: NewContact): Promise<ContactRow>;
  updateContact(id: string, patch: Partial<ContactRow>): Promise<ContactRow>;
  linkChannel(clientId: string, channel: Channel, externalId: string, contactId: string): Promise<void>;

  getThread(id: string): Promise<ThreadRow | null>;
  findLatestThread(clientId: string, contactId: string, channel: Channel): Promise<ThreadRow | null>;
  insertThread(row: NewThread): Promise<ThreadRow>;
  updateThread(id: string, patch: Partial<ThreadRow>): Promise<ThreadRow>;

  /** Insert-first dedupe: returns duplicate=true when (client, channel, provider_message_id) already exists. */
  insertMessage(row: NewMessage): Promise<{ message: MessageRow; duplicate: boolean }>;
  listThreadMessages(threadId: string, limit: number): Promise<MessageRow[]>;
  countInbound(clientId: string, contactId: string, sinceIso: string): Promise<number>;
  listMessagesBetween(clientId: string, fromIso: string, toIso: string): Promise<MessageRow[]>;
  listThreadMessagesAfter(threadId: string, afterIso: string): Promise<MessageRow[]>;

  upsertBooking(row: NewBooking): Promise<BookingRow>;
  getBooking(id: string): Promise<BookingRow | null>;
  updateBooking(id: string, patch: Partial<BookingRow>): Promise<BookingRow>;
  listUpcomingBookingsForContact(clientId: string, contactId: string, nowIso: string): Promise<BookingRow[]>;
  listBookingsStartingBetween(clientId: string, fromIso: string, toIso: string): Promise<BookingRow[]>;
  listBookingsCreatedBetween(clientId: string, fromIso: string, toIso: string): Promise<BookingRow[]>;

  insertLead(row: NewLead): Promise<LeadRow>;
  getLead(id: string): Promise<LeadRow | null>;
  updateLead(id: string, patch: Partial<LeadRow>): Promise<LeadRow>;
  listLeadsDueForNurture(clientId: string, nowIso: string): Promise<LeadRow[]>;
  listActiveLeadsForContact(clientId: string, contactId: string): Promise<LeadRow[]>;
  listLeadsReceivedBetween(clientId: string, fromIso: string, toIso: string): Promise<LeadRow[]>;

  insertEscalation(row: NewEscalation): Promise<EscalationRow>;
  getEscalation(id: string): Promise<EscalationRow | null>;
  /** Atomic open → claimed. Returns null when someone else claimed it first. */
  claimEscalation(id: string, claimedBy: string, claimedByName: string, nowIso: string): Promise<EscalationRow | null>;
  updateEscalation(id: string, patch: Partial<EscalationRow>): Promise<EscalationRow>;
  findEscalationByCode(clientId: string, code: string): Promise<EscalationRow | null>;
  findOpenEscalationForThread(threadId: string): Promise<EscalationRow | null>;
  findActiveClaimForStaff(clientId: string, staffId: string): Promise<EscalationRow | null>;
  listOpenEscalations(clientId: string): Promise<EscalationRow[]>;
  listEscalationsCreatedBetween(clientId: string, fromIso: string, toIso: string): Promise<EscalationRow[]>;

  insertUsage(rows: UsageRow[]): Promise<void>;
  sumUsageSince(clientId: string, sinceIso: string): Promise<number>;

  upsertMetricsDaily(row: MetricsDailyRow): Promise<void>;
  listMetrics(clientId: string, fromDay: string, toDay: string): Promise<MetricsDailyRow[]>;

  /** Idempotency marker for scheduled work: true the first time a key is seen for a client. */
  markOnce(clientId: string, key: string): Promise<boolean>;
  audit(clientId: string | null, actor: string, action: string, detail?: Record<string, unknown>): Promise<void>;

  matchFaq(clientId: string, embedding: number[], k: number): Promise<FaqMatch[]>;
  replaceFaqChunks(clientId: string, chunks: { source: string; content: string; embedding: number[] }[]): Promise<void>;
}
