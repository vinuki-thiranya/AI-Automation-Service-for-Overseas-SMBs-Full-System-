// Store backed by one Supabase project (one per region), using the service-role key.
// RLS is bypassed by the service role; tenant scoping is explicit in every query.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "../config/index.ts";
import { validateClientConfig } from "../config/index.ts";
import type {
  BookingRow, Channel, ContactRow, EscalationRow, FaqMatch, LeadRow, MessageRow, MetricsDailyRow,
  NewBooking, NewContact, NewEscalation, NewLead, NewMessage, NewThread, Store, ThreadRow, UsageRow,
} from "./types.ts";

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

function must<T>(res: Result<T>, what: string): T {
  if (res.error) throw new Error(`supabase ${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`supabase ${what}: no data`);
  return res.data;
}

function maybe<T>(res: Result<T>, what: string): T | null {
  if (res.error) throw new Error(`supabase ${what}: ${res.error.message}`);
  return res.data;
}

interface ClientDbRow {
  id: string;
  slug: string;
  region: Client["region"];
  status: Client["status"];
  config: unknown;
}

export class SupabaseStore implements Store {
  readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private toClient(row: ClientDbRow): Client {
    return { id: row.id, slug: row.slug, region: row.region, status: row.status, config: validateClientConfig(row.config) };
  }

  async getClientBySlug(slug: string) {
    const row = maybe(await this.db.from("clients").select("id, slug, region, status, config").eq("slug", slug).maybeSingle(), "getClientBySlug");
    return row ? this.toClient(row as ClientDbRow) : null;
  }
  async listActiveClients() {
    const rows = must(await this.db.from("clients").select("id, slug, region, status, config").in("status", ["demo", "uat", "live"]), "listActiveClients");
    return (rows as ClientDbRow[]).map((r) => this.toClient(r));
  }

  async getContact(id: string) {
    return maybe(await this.db.from("contacts").select("*").eq("id", id).maybeSingle(), "getContact") as ContactRow | null;
  }
  async findContactByChannel(clientId: string, channel: Channel, externalId: string) {
    const link = maybe(await this.db.from("contact_channels").select("contact_id")
      .eq("client_id", clientId).eq("channel", channel).eq("external_id", externalId).maybeSingle(), "findContactByChannel");
    return link ? this.getContact((link as { contact_id: string }).contact_id) : null;
  }
  async findContactByPhone(clientId: string, phone: string) {
    return maybe(await this.db.from("contacts").select("*").eq("client_id", clientId).eq("phone", phone).maybeSingle(), "findContactByPhone") as ContactRow | null;
  }
  async findContactByEmail(clientId: string, email: string) {
    return maybe(await this.db.from("contacts").select("*").eq("client_id", clientId).ilike("email", email).limit(1).maybeSingle(), "findContactByEmail") as ContactRow | null;
  }
  async insertContact(row: NewContact) {
    return must(await this.db.from("contacts").insert(row).select().single(), "insertContact") as ContactRow;
  }
  async updateContact(id: string, patch: Partial<ContactRow>) {
    return must(await this.db.from("contacts").update(patch).eq("id", id).select().single(), "updateContact") as ContactRow;
  }
  async linkChannel(clientId: string, channel: Channel, externalId: string, contactId: string) {
    const res = await this.db.from("contact_channels")
      .upsert({ client_id: clientId, channel, external_id: externalId, contact_id: contactId }, { onConflict: "client_id,channel,external_id" });
    if (res.error) throw new Error(`supabase linkChannel: ${res.error.message}`);
  }

  async getThread(id: string) {
    return maybe(await this.db.from("threads").select("*").eq("id", id).maybeSingle(), "getThread") as ThreadRow | null;
  }
  async findLatestThread(clientId: string, contactId: string, channel: Channel) {
    return maybe(await this.db.from("threads").select("*").eq("client_id", clientId).eq("contact_id", contactId)
      .eq("channel", channel).order("last_message_at", { ascending: false }).limit(1).maybeSingle(), "findLatestThread") as ThreadRow | null;
  }
  async insertThread(row: NewThread) {
    return must(await this.db.from("threads").insert(row).select().single(), "insertThread") as ThreadRow;
  }
  async updateThread(id: string, patch: Partial<ThreadRow>) {
    return must(await this.db.from("threads").update(patch).eq("id", id).select().single(), "updateThread") as ThreadRow;
  }

  async insertMessage(row: NewMessage) {
    const res = await this.db.from("messages").insert(row).select().single();
    if (res.error?.code === "23505" && row.provider_message_id) {
      const existing = must(await this.db.from("messages").select("*").eq("client_id", row.client_id)
        .eq("channel", row.channel).eq("provider_message_id", row.provider_message_id).single(), "insertMessage(dup)");
      return { message: existing as unknown as MessageRow, duplicate: true };
    }
    return { message: must(res, "insertMessage") as MessageRow, duplicate: false };
  }
  async listThreadMessages(threadId: string, limit: number) {
    const rows = must(await this.db.from("messages").select("*").eq("thread_id", threadId)
      .order("created_at", { ascending: false }).limit(limit), "listThreadMessages") as MessageRow[];
    return rows.reverse();
  }
  async listThreadMessagesAfter(threadId: string, afterIso: string) {
    return must(await this.db.from("messages").select("*").eq("thread_id", threadId).gt("created_at", afterIso)
      .order("created_at"), "listThreadMessagesAfter") as MessageRow[];
  }
  async countInbound(clientId: string, contactId: string, sinceIso: string) {
    const threads = must(await this.db.from("threads").select("id").eq("client_id", clientId).eq("contact_id", contactId), "countInbound/threads") as { id: string }[];
    if (threads.length === 0) return 0;
    const res = await this.db.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId)
      .eq("direction", "inbound").gte("created_at", sinceIso).in("thread_id", threads.map((t) => t.id));
    if (res.error) throw new Error(`supabase countInbound: ${res.error.message}`);
    return res.count ?? 0;
  }
  async listMessagesBetween(clientId: string, fromIso: string, toIso: string) {
    return must(await this.db.from("messages").select("*").eq("client_id", clientId).gte("created_at", fromIso)
      .lt("created_at", toIso).order("created_at").limit(50_000), "listMessagesBetween") as MessageRow[];
  }

  async upsertBooking(row: NewBooking) {
    return must(await this.db.from("bookings").upsert(row, { onConflict: "client_id,adapter,external_booking_id" }).select().single(), "upsertBooking") as BookingRow;
  }
  async getBooking(id: string) {
    return maybe(await this.db.from("bookings").select("*").eq("id", id).maybeSingle(), "getBooking") as BookingRow | null;
  }
  async updateBooking(id: string, patch: Partial<BookingRow>) {
    return must(await this.db.from("bookings").update(patch).eq("id", id).select().single(), "updateBooking") as BookingRow;
  }
  async listUpcomingBookingsForContact(clientId: string, contactId: string, nowIso: string) {
    return must(await this.db.from("bookings").select("*").eq("client_id", clientId).eq("contact_id", contactId)
      .gt("starts_at", nowIso).in("status", ["booked", "rescheduled"]).order("starts_at"), "listUpcomingBookingsForContact") as BookingRow[];
  }
  async listBookingsStartingBetween(clientId: string, fromIso: string, toIso: string) {
    return must(await this.db.from("bookings").select("*").eq("client_id", clientId).gte("starts_at", fromIso)
      .lt("starts_at", toIso), "listBookingsStartingBetween") as BookingRow[];
  }
  async listBookingsCreatedBetween(clientId: string, fromIso: string, toIso: string) {
    return must(await this.db.from("bookings").select("*").eq("client_id", clientId).gte("created_at", fromIso)
      .lt("created_at", toIso), "listBookingsCreatedBetween") as BookingRow[];
  }

  async insertLead(row: NewLead) {
    return must(await this.db.from("leads").insert(row).select().single(), "insertLead") as LeadRow;
  }
  async getLead(id: string) {
    return maybe(await this.db.from("leads").select("*").eq("id", id).maybeSingle(), "getLead") as LeadRow | null;
  }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    return must(await this.db.from("leads").update(patch).eq("id", id).select().single(), "updateLead") as LeadRow;
  }
  async listLeadsDueForNurture(clientId: string, nowIso: string) {
    return must(await this.db.from("leads").select("*").eq("client_id", clientId).eq("status", "nurturing")
      .is("nurture_stopped_at", null).lte("next_nurture_at", nowIso), "listLeadsDueForNurture") as LeadRow[];
  }
  async listActiveLeadsForContact(clientId: string, contactId: string) {
    return must(await this.db.from("leads").select("*").eq("client_id", clientId).eq("contact_id", contactId)
      .in("status", ["new", "qualifying", "nurturing"]), "listActiveLeadsForContact") as LeadRow[];
  }
  async listLeadsReceivedBetween(clientId: string, fromIso: string, toIso: string) {
    return must(await this.db.from("leads").select("*").eq("client_id", clientId).gte("received_at", fromIso)
      .lt("received_at", toIso), "listLeadsReceivedBetween") as LeadRow[];
  }

  async insertEscalation(row: NewEscalation) {
    return must(await this.db.from("escalations").insert(row).select().single(), "insertEscalation") as EscalationRow;
  }
  async getEscalation(id: string) {
    return maybe(await this.db.from("escalations").select("*").eq("id", id).maybeSingle(), "getEscalation") as EscalationRow | null;
  }
  async claimEscalation(id: string, claimedBy: string, claimedByName: string, nowIso: string) {
    // Conditional update: only one concurrent claimer can move status open → claimed.
    const rows = must(await this.db.from("escalations")
      .update({ status: "claimed", claimed_by: claimedBy, claimed_by_name: claimedByName, claimed_at: nowIso })
      .eq("id", id).eq("status", "open").select(), "claimEscalation") as EscalationRow[];
    return rows[0] ?? null;
  }
  async updateEscalation(id: string, patch: Partial<EscalationRow>) {
    return must(await this.db.from("escalations").update(patch).eq("id", id).select().single(), "updateEscalation") as EscalationRow;
  }
  async findEscalationByCode(clientId: string, code: string) {
    return maybe(await this.db.from("escalations").select("*").eq("client_id", clientId).eq("claim_code", code)
      .eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(), "findEscalationByCode") as EscalationRow | null;
  }
  async findOpenEscalationForThread(threadId: string) {
    return maybe(await this.db.from("escalations").select("*").eq("thread_id", threadId).in("status", ["open", "claimed"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle(), "findOpenEscalationForThread") as EscalationRow | null;
  }
  async findActiveClaimForStaff(clientId: string, staffId: string) {
    return maybe(await this.db.from("escalations").select("*").eq("client_id", clientId).eq("status", "claimed")
      .eq("claimed_by", staffId).order("claimed_at", { ascending: false }).limit(1).maybeSingle(), "findActiveClaimForStaff") as EscalationRow | null;
  }
  async listOpenEscalations(clientId: string) {
    return must(await this.db.from("escalations").select("*").eq("client_id", clientId).in("status", ["open", "claimed"]), "listOpenEscalations") as EscalationRow[];
  }
  async listEscalationsCreatedBetween(clientId: string, fromIso: string, toIso: string) {
    return must(await this.db.from("escalations").select("*").eq("client_id", clientId).gte("created_at", fromIso)
      .lt("created_at", toIso), "listEscalationsCreatedBetween") as EscalationRow[];
  }

  async insertUsage(rows: UsageRow[]) {
    if (rows.length === 0) return;
    const res = await this.db.from("usage_events").insert(rows);
    if (res.error) throw new Error(`supabase insertUsage: ${res.error.message}`);
  }
  async sumUsageSince(clientId: string, sinceIso: string) {
    const rows = must(await this.db.from("usage_events").select("cost_usd").eq("client_id", clientId).gte("occurred_at", sinceIso), "sumUsageSince") as { cost_usd: number }[];
    return rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  }

  async upsertMetricsDaily(row: MetricsDailyRow) {
    const res = await this.db.from("metrics_daily").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "client_id,day" });
    if (res.error) throw new Error(`supabase upsertMetricsDaily: ${res.error.message}`);
  }
  async listMetrics(clientId: string, fromDay: string, toDay: string) {
    return must(await this.db.from("metrics_daily").select("*").eq("client_id", clientId).gte("day", fromDay)
      .lte("day", toDay).order("day"), "listMetrics") as MetricsDailyRow[];
  }

  async markOnce(clientId: string, key: string) {
    const res = await this.db.from("job_marks").insert({ client_id: clientId, key });
    if (res.error?.code === "23505") return false;
    if (res.error) throw new Error(`supabase markOnce: ${res.error.message}`);
    return true;
  }
  async audit(clientId: string | null, actor: string, action: string, detail: Record<string, unknown> = {}) {
    const res = await this.db.from("audit_log").insert({ client_id: clientId, actor, action, detail });
    if (res.error) throw new Error(`supabase audit: ${res.error.message}`);
  }

  async matchFaq(clientId: string, embedding: number[], k: number) {
    return must(await this.db.rpc("match_faq_chunks", {
      p_client_id: clientId, p_query_embedding: JSON.stringify(embedding), p_match_count: k,
    }), "matchFaq") as FaqMatch[];
  }
  async replaceFaqChunks(clientId: string, chunks: { source: string; content: string; embedding: number[] }[]) {
    const del = await this.db.from("faq_chunks").delete().eq("client_id", clientId);
    if (del.error) throw new Error(`supabase replaceFaqChunks(delete): ${del.error.message}`);
    if (chunks.length === 0) return;
    const res = await this.db.from("faq_chunks").insert(chunks.map((c) => ({
      client_id: clientId, source: c.source, content: c.content, embedding: JSON.stringify(c.embedding),
    })));
    if (res.error) throw new Error(`supabase replaceFaqChunks(insert): ${res.error.message}`);
  }
}

/** Routes each call to the Supabase project of the client's region. */
export class RegionalStores {
  private readonly stores = new Map<string, SupabaseStore>();

  constructor(projects: Partial<Record<Client["region"], { url: string; serviceRoleKey: string }>>) {
    for (const [region, p] of Object.entries(projects)) {
      if (p) this.stores.set(region, new SupabaseStore(p.url, p.serviceRoleKey));
    }
  }

  forRegion(region: string): SupabaseStore {
    const s = this.stores.get(region);
    if (!s) throw new Error(`no Supabase project configured for region '${region}'`);
    return s;
  }

  all(): SupabaseStore[] {
    return [...this.stores.values()];
  }
}
