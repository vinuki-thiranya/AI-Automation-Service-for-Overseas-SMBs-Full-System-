// In-memory Store for unit tests and the QA suite. Behaviour matches SupabaseStore,
// including dedupe conflicts and the atomic escalation claim.
import type { Client } from "../config/index.ts";
import { uuid } from "../util.ts";
import type {
  BookingRow, Channel, ContactRow, EscalationRow, FaqMatch, LeadRow, MessageRow, MetricsDailyRow,
  NewBooking, NewContact, NewEscalation, NewLead, NewMessage, NewThread, Store, ThreadRow, UsageRow,
} from "./types.ts";

const between = (iso: string, from: string, to: string) => iso >= from && iso < to;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export class MemoryStore implements Store {
  readonly clients = new Map<string, Client>();
  readonly contacts = new Map<string, ContactRow>();
  readonly channels = new Map<string, string>();
  readonly threads = new Map<string, ThreadRow>();
  readonly messages: MessageRow[] = [];
  readonly bookings = new Map<string, BookingRow>();
  readonly leads = new Map<string, LeadRow>();
  readonly escalations = new Map<string, EscalationRow>();
  readonly usage: UsageRow[] = [];
  readonly metrics = new Map<string, MetricsDailyRow>();
  readonly marks = new Set<string>();
  readonly auditLog: { client_id: string | null; actor: string; action: string; detail: Record<string, unknown> }[] = [];
  faq: { client_id: string; id: string; source: string; content: string; embedding: number[] }[] = [];

  private readonly now: () => Date;

  /** QA and tests read "now" from the same injected clock as the engine. */
  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  private ts(): string {
    return this.now().toISOString();
  }

  addClient(client: Client): void {
    this.clients.set(client.slug, client);
  }

  async getClientBySlug(slug: string) { return this.clients.get(slug) ?? null; }
  async listActiveClients() {
    return [...this.clients.values()].filter((c) => ["demo", "uat", "live"].includes(c.status));
  }

  async getContact(id: string) { return this.contacts.get(id) ?? null; }
  async findContactByChannel(clientId: string, channel: Channel, externalId: string) {
    const id = this.channels.get(`${clientId}|${channel}|${externalId}`);
    return id ? this.contacts.get(id) ?? null : null;
  }
  async findContactByPhone(clientId: string, phone: string) {
    return [...this.contacts.values()].find((c) => c.client_id === clientId && c.phone === phone) ?? null;
  }
  async findContactByEmail(clientId: string, email: string) {
    const e = email.toLowerCase();
    return [...this.contacts.values()].find((c) => c.client_id === clientId && c.email?.toLowerCase() === e) ?? null;
  }
  async insertContact(row: NewContact) {
    const now = this.ts();
    const c: ContactRow = {
      name: null, phone: null, email: null, language: "en", crm_external_id: null,
      consent_marketing_at: null, opted_out_at: null, updated_at: now, ...row, id: uuid(), created_at: now,
    };
    this.contacts.set(c.id, c);
    return c;
  }
  async updateContact(id: string, patch: Partial<ContactRow>) {
    const c = this.must(this.contacts, id);
    Object.assign(c, patch, { updated_at: this.ts() });
    return c;
  }
  async linkChannel(clientId: string, channel: Channel, externalId: string, contactId: string) {
    this.channels.set(`${clientId}|${channel}|${externalId}`, contactId);
  }

  async getThread(id: string) { return this.threads.get(id) ?? null; }
  async findLatestThread(clientId: string, contactId: string, channel: Channel) {
    return [...this.threads.values()]
      .filter((t) => t.client_id === clientId && t.contact_id === contactId && t.channel === channel)
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0] ?? null;
  }
  async insertThread(row: NewThread) {
    const now = this.ts();
    const t: ThreadRow = {
      status: "ai", ai_paused_until: null, summary: null, disclosed_at: null, last_inbound_at: null,
      last_message_at: now, state: {}, ...row, id: uuid(), created_at: now,
    };
    this.threads.set(t.id, t);
    return t;
  }
  async updateThread(id: string, patch: Partial<ThreadRow>) {
    return Object.assign(this.must(this.threads, id), patch);
  }

  async insertMessage(row: NewMessage) {
    if (row.provider_message_id) {
      const dup = this.messages.find((m) =>
        m.client_id === row.client_id && m.channel === row.channel && m.provider_message_id === row.provider_message_id);
      if (dup) return { message: dup, duplicate: true };
    }
    const m: MessageRow = {
      provider_message_id: null, attachments: [], metadata: {}, body: null, ...row, id: uuid(), created_at: this.ts(),
    };
    this.messages.push(m);
    return { message: m, duplicate: false };
  }
  async listThreadMessages(threadId: string, limit: number) {
    return this.messages.filter((m) => m.thread_id === threadId).slice(-limit);
  }
  async listThreadMessagesAfter(threadId: string, afterIso: string) {
    return this.messages.filter((m) => m.thread_id === threadId && m.created_at > afterIso);
  }
  async countInbound(clientId: string, contactId: string, sinceIso: string) {
    const threadIds = new Set([...this.threads.values()].filter((t) => t.contact_id === contactId).map((t) => t.id));
    return this.messages.filter((m) =>
      m.client_id === clientId && m.direction === "inbound" && threadIds.has(m.thread_id) && m.created_at >= sinceIso).length;
  }
  async listMessagesBetween(clientId: string, fromIso: string, toIso: string) {
    return this.messages.filter((m) => m.client_id === clientId && between(m.created_at, fromIso, toIso));
  }

  async upsertBooking(row: NewBooking) {
    const existing = [...this.bookings.values()].find((b) =>
      b.client_id === row.client_id && b.adapter === row.adapter && b.external_booking_id === row.external_booking_id);
    const now = this.ts();
    if (existing) return Object.assign(existing, row, { updated_at: now });
    const b: BookingRow = {
      contact_id: null, thread_id: null, service_id: null, practitioner: null, status: "booked",
      reminders_sent: [], updated_at: now, ...row, id: uuid(), created_at: now,
    };
    this.bookings.set(b.id, b);
    return b;
  }
  async getBooking(id: string) { return this.bookings.get(id) ?? null; }
  async updateBooking(id: string, patch: Partial<BookingRow>) {
    return Object.assign(this.must(this.bookings, id), patch, { updated_at: this.ts() });
  }
  async listUpcomingBookingsForContact(clientId: string, contactId: string, nowIso: string) {
    return [...this.bookings.values()]
      .filter((b) => b.client_id === clientId && b.contact_id === contactId && b.starts_at > nowIso && ["booked", "rescheduled"].includes(b.status))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  async listBookingsStartingBetween(clientId: string, fromIso: string, toIso: string) {
    return [...this.bookings.values()].filter((b) => b.client_id === clientId && between(b.starts_at, fromIso, toIso));
  }
  async listBookingsCreatedBetween(clientId: string, fromIso: string, toIso: string) {
    return [...this.bookings.values()].filter((b) => b.client_id === clientId && between(b.created_at, fromIso, toIso));
  }

  async insertLead(row: NewLead) {
    const now = this.ts();
    const l: LeadRow = {
      contact_id: null, thread_id: null, answers: {}, rule_score: null, llm_score: null, score: null, grade: null,
      status: "new", received_at: now, first_response_at: null, crm_external_id: null, nurture_step: 0,
      next_nurture_at: null, nurture_stopped_at: null, ...row, id: uuid(), created_at: now,
    };
    this.leads.set(l.id, l);
    return l;
  }
  async getLead(id: string) { return this.leads.get(id) ?? null; }
  async updateLead(id: string, patch: Partial<LeadRow>) { return Object.assign(this.must(this.leads, id), patch); }
  async listLeadsDueForNurture(clientId: string, nowIso: string) {
    return [...this.leads.values()].filter((l) =>
      l.client_id === clientId && l.status === "nurturing" && !l.nurture_stopped_at && l.next_nurture_at !== null && l.next_nurture_at <= nowIso);
  }
  async listActiveLeadsForContact(clientId: string, contactId: string) {
    return [...this.leads.values()].filter((l) =>
      l.client_id === clientId && l.contact_id === contactId && ["new", "qualifying", "nurturing"].includes(l.status));
  }
  async listLeadsReceivedBetween(clientId: string, fromIso: string, toIso: string) {
    return [...this.leads.values()].filter((l) => l.client_id === clientId && between(l.received_at, fromIso, toIso));
  }

  async insertEscalation(row: NewEscalation) {
    const e: EscalationRow = {
      status: "open", claimed_by: null, claimed_by_name: null, owner_notified_at: null, claimed_at: null,
      resolved_at: null, ...row, id: uuid(), created_at: this.ts(),
    };
    this.escalations.set(e.id, e);
    return e;
  }
  async getEscalation(id: string) { return this.escalations.get(id) ?? null; }
  async claimEscalation(id: string, claimedBy: string, claimedByName: string, nowIso: string) {
    const e = this.escalations.get(id);
    if (!e || e.status !== "open") return null;
    return Object.assign(e, { status: "claimed" as const, claimed_by: claimedBy, claimed_by_name: claimedByName, claimed_at: nowIso });
  }
  async updateEscalation(id: string, patch: Partial<EscalationRow>) { return Object.assign(this.must(this.escalations, id), patch); }
  async findEscalationByCode(clientId: string, code: string) {
    return [...this.escalations.values()].find((e) => e.client_id === clientId && e.claim_code === code && e.status === "open") ?? null;
  }
  async findOpenEscalationForThread(threadId: string) {
    return [...this.escalations.values()].find((e) => e.thread_id === threadId && (e.status === "open" || e.status === "claimed")) ?? null;
  }
  async findActiveClaimForStaff(clientId: string, staffId: string) {
    return [...this.escalations.values()]
      .filter((e) => e.client_id === clientId && e.status === "claimed" && e.claimed_by === staffId)
      .sort((a, b) => (b.claimed_at ?? "").localeCompare(a.claimed_at ?? ""))[0] ?? null;
  }
  async listOpenEscalations(clientId: string) {
    return [...this.escalations.values()].filter((e) => e.client_id === clientId && (e.status === "open" || e.status === "claimed"));
  }
  async listEscalationsCreatedBetween(clientId: string, fromIso: string, toIso: string) {
    return [...this.escalations.values()].filter((e) => e.client_id === clientId && between(e.created_at, fromIso, toIso));
  }

  async insertUsage(rows: UsageRow[]) {
    for (const r of rows) this.usage.push({ ...r, occurred_at: r.occurred_at ?? this.ts() });
  }
  async sumUsageSince(clientId: string, sinceIso: string) {
    return this.usage.filter((u) => u.client_id === clientId && (u.occurred_at ?? "") >= sinceIso).reduce((s, u) => s + u.cost_usd, 0);
  }

  async upsertMetricsDaily(row: MetricsDailyRow) { this.metrics.set(`${row.client_id}|${row.day}`, row); }
  async listMetrics(clientId: string, fromDay: string, toDay: string) {
    return [...this.metrics.values()].filter((m) => m.client_id === clientId && m.day >= fromDay && m.day <= toDay)
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  async markOnce(clientId: string, key: string) {
    const k = `${clientId}|${key}`;
    if (this.marks.has(k)) return false;
    this.marks.add(k);
    return true;
  }
  async audit(clientId: string | null, actor: string, action: string, detail: Record<string, unknown> = {}) {
    this.auditLog.push({ client_id: clientId, actor, action, detail });
  }

  async matchFaq(clientId: string, embedding: number[], k: number): Promise<FaqMatch[]> {
    return this.faq.filter((f) => f.client_id === clientId)
      .map((f) => ({ id: f.id, source: f.source, content: f.content, similarity: cosine(f.embedding, embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
  async replaceFaqChunks(clientId: string, chunks: { source: string; content: string; embedding: number[] }[]) {
    this.faq = this.faq.filter((f) => f.client_id !== clientId).concat(chunks.map((c) => ({ ...c, client_id: clientId, id: uuid() })));
  }

  private must<T>(map: Map<string, T>, id: string): T {
    const v = map.get(id);
    if (!v) throw new Error(`not found: ${id}`);
    return v;
  }
}
