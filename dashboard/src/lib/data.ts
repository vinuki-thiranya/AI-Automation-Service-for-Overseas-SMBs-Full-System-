// Every read the dashboard makes. All of them run as the signed-in user, so RLS and the RPC checks in
// supabase/migrations/20261107000000_dashboard.sql decide what comes back.
import { cache } from "react";
import { supabaseServer } from "./supabase/server";

export type Role = "agency" | "owner" | "staff";
export interface Membership {
  client_id: string;
  slug: string;
  name: string;
  role: Role;
  status: string;
  timezone: string;
  packages: string[];
}

export interface MetricsRow {
  day: string;
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
  revenue_influenced: number | null;   // null for staff
  revenue_currency: string | null;
  llm_cost_usd: number | null;
  messaging_cost_usd: number | null;
}

export type Hours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { open: string; close: string }[]>>;

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export const getUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("my_memberships");
  if (error) fail("memberships", error);
  return (data ?? []) as Membership[];
});

export const isAgency = cache(async (): Promise<boolean> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("is_agency_user");
  if (error) fail("agency check", error);
  return Boolean(data);
});

export const getMembership = cache(async (slug: string) => (await getMemberships()).find((m) => m.slug === slug) ?? null);

export const getClientSettings = cache(async (clientId: string) => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("clients")
    .select("hours:config->business->hours, revenue:config->reporting->revenue_per_booking, assistant:config->assistant->>persona_name, phone:config->business->>phone")
    .eq("id", clientId).single();
  if (error) fail("client settings", error);
  const row = data as { hours: Hours | null; revenue: { amount: number; currency: string } | null; assistant: string | null; phone: string | null };
  return { hours: row.hours ?? {}, revenuePerBooking: row.revenue, assistantName: row.assistant ?? "The assistant", phone: row.phone };
});

export async function getMetrics(clientId: string, from: string, to: string): Promise<MetricsRow[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("dashboard_metrics", { p_client: clientId, p_from: from, p_to: to });
  if (error) fail("metrics", error);
  return ((data ?? []) as MetricsRow[]).map((r) => ({
    ...r,
    median_response_seconds: r.median_response_seconds === null ? null : Number(r.median_response_seconds),
    p95_response_seconds: r.p95_response_seconds === null ? null : Number(r.p95_response_seconds),
    revenue_influenced: r.revenue_influenced === null ? null : Number(r.revenue_influenced),
    llm_cost_usd: r.llm_cost_usd === null ? null : Number(r.llm_cost_usd),
  }));
}

export async function getEnquiryHours(clientId: string, from: string, to: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("enquiry_hours", { p_client: clientId, p_from: from, p_to: to });
  if (error) fail("enquiry hours", error);
  return (data ?? []) as { weekday: number; hour: number; enquiries: number }[];
}

export async function getEnquiriesByDay(clientId: string, from: string, to: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("enquiries_by_day", { p_client: clientId, p_from: from, p_to: to });
  if (error) fail("enquiries by day", error);
  return (data ?? []) as { day: string; enquiries: number; after_hours: number }[];
}

export const getAttentionCounts = cache(async (clientId: string) => {
  const supabase = await supabaseServer();
  const [esc, drafts] = await Promise.all([
    supabase.from("escalations").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "open"),
    supabase.from("reply_drafts").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "pending"),
  ]);
  return { openEscalations: esc.count ?? 0, pendingDrafts: drafts.count ?? 0 };
});

export interface ThreadListItem {
  id: string;
  channel: string;
  status: "ai" | "human" | "closed";
  last_message_at: string;
  contact: { name: string | null; phone: string | null } | null;
  preview: string | null;
  previewAuthor: string | null;
  openEscalation: boolean;
}

/** Threads with an enquiry in one local weekday (1 = Mon) and, optionally, hour: a heatmap cell. */
export async function threadsInHour(clientId: string, from: string, to: string, dow: number, hour?: number, before?: string): Promise<string[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("threads_in_hour", { p_client: clientId, p_from: from, p_to: to, p_dow: dow, p_hour: hour ?? null, p_limit: 40, p_before: before ?? null });
  if (error) fail("threads_in_hour", error);
  return ((data ?? []) as { thread_id: string }[]).map((r) => r.thread_id);
}

export async function listThreads(clientId: string, opts: { channel?: string; status?: string; before?: string; limit?: number; ids?: string[] } = {}): Promise<ThreadListItem[]> {
  const supabase = await supabaseServer();
  if (opts.ids && opts.ids.length === 0) return [];
  let q = supabase.from("threads").select("id, channel, status, last_message_at, contact:contacts(name, phone)")
    .eq("client_id", clientId).order("last_message_at", { ascending: false }).limit(opts.limit ?? 40);
  if (opts.channel) q = q.eq("channel", opts.channel);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.before) q = q.lt("last_message_at", opts.before);
  if (opts.ids) q = q.in("id", opts.ids);
  const { data, error } = await q;
  if (error) fail("threads", error);
  const threads = (data ?? []) as unknown as Omit<ThreadListItem, "preview" | "previewAuthor" | "openEscalation">[];
  if (threads.length === 0) return [];
  const ids = threads.map((t) => t.id);
  const [msgs, esc] = await Promise.all([
    supabase.from("messages").select("thread_id, body, author, created_at").in("thread_id", ids).order("created_at", { ascending: false }).limit(ids.length * 8),
    supabase.from("escalations").select("thread_id").in("thread_id", ids).eq("status", "open"),
  ]);
  const latest = new Map<string, { body: string | null; author: string }>();
  for (const m of (msgs.data ?? []) as { thread_id: string; body: string | null; author: string }[]) if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);
  const open = new Set(((esc.data ?? []) as { thread_id: string }[]).map((e) => e.thread_id));
  return threads.map((t) => ({ ...t, preview: latest.get(t.id)?.body ?? null, previewAuthor: latest.get(t.id)?.author ?? null, openEscalation: open.has(t.id) }));
}

export interface SearchHit {
  message_id: string;
  thread_id: string;
  created_at: string;
  author: string;
  channel: string;
  contact_name: string | null;
  snippet: string;
}

export async function searchMessages(clientId: string, query: string, before?: string): Promise<SearchHit[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("search_messages", { p_client: clientId, p_query: query, p_limit: 50, p_before: before ?? null });
  if (error) fail("search", error);
  return (data ?? []) as SearchHit[];
}

export interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  author: "customer" | "assistant" | "staff" | "system";
  channel: string;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getThread(clientId: string, threadId: string) {
  const supabase = await supabaseServer();
  const [thread, messages, escalations, bookings] = await Promise.all([
    supabase.from("threads").select("id, channel, status, last_message_at, created_at, contact:contacts(name, phone, email)").eq("client_id", clientId).eq("id", threadId).maybeSingle(),
    supabase.from("messages").select("id, direction, author, channel, body, metadata, created_at").eq("thread_id", threadId).order("created_at").limit(500),
    supabase.from("escalations").select("id, reason, summary, status, claimed_by_name, created_at, claimed_at, resolved_at").eq("thread_id", threadId).order("created_at"),
    supabase.from("bookings").select("id, service_id, practitioner, starts_at, status").eq("thread_id", threadId).order("starts_at"),
  ]);
  if (thread.error) fail("thread", thread.error);
  if (!thread.data) return null;
  return {
    thread: thread.data as unknown as { id: string; channel: string; status: string; last_message_at: string; created_at: string; contact: { name: string | null; phone: string | null; email: string | null } | null },
    messages: (messages.data ?? []) as MessageRow[],
    escalations: (escalations.data ?? []) as { id: string; reason: string; summary: string; status: string; claimed_by_name: string | null; created_at: string; claimed_at: string | null; resolved_at: string | null }[],
    bookings: (bookings.data ?? []) as { id: string; service_id: string | null; practitioner: string | null; starts_at: string; status: string }[],
  };
}

export interface Draft {
  id: string;
  helpdesk: string;
  external_ticket_id: string;
  customer_name: string | null;
  subject: string | null;
  customer_message: string;
  draft_body: string;
  final_body: string | null;
  confidence: number | null;
  status: "pending" | "approved" | "rejected" | "sent" | "failed";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export async function listDrafts(clientId: string, state: "pending" | "decided"): Promise<Draft[]> {
  const supabase = await supabaseServer();
  let q = supabase.from("reply_drafts").select("*").eq("client_id", clientId);
  q = state === "pending" ? q.eq("status", "pending").order("created_at", { ascending: true }) : q.neq("status", "pending").order("decided_at", { ascending: false }).limit(30);
  const { data, error } = await q;
  if (error) fail("drafts", error);
  return (data ?? []) as Draft[];
}

export interface Invoice {
  id: string;
  number: string;
  kind: string;
  description: string | null;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "void";
  issued_on: string;
  due_on: string | null;
  paid_on: string | null;
  provider: string | null;
  url: string | null;
}

export async function listInvoices(clientId: string): Promise<Invoice[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("invoices").select("*").eq("client_id", clientId).order("issued_on", { ascending: false });
  if (error) fail("invoices", error);
  return ((data ?? []) as Invoice[]).map((i) => ({ ...i, amount: Number(i.amount) }));
}

export async function listResources(clientId: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("client_resources").select("id, kind, title, url, note").eq("client_id", clientId).order("sort");
  if (error) fail("resources", error);
  return (data ?? []) as { id: string; kind: string; title: string; url: string | null; note: string | null }[];
}

export interface HealthRow {
  client_id: string;
  slug: string;
  name: string;
  status: string;
  messages: number;
  inbound: number;
  spend_usd: number;
  open_escalations: number;
  issues: number;
  last_message_at: string | null;
}

export async function agencyHealth(since: string): Promise<HealthRow[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("agency_health", { p_since: since });
  if (error) fail("agency health", error);
  return ((data ?? []) as HealthRow[]).map((r) => ({ ...r, spend_usd: Number(r.spend_usd) }));
}
