// Dashboard access rules against a real Supabase stack (migration 20261107000000_dashboard.sql).
// Each role signs in with the anon key like the dashboard does, so RLS and the RPC checks are what's tested.
// Skipped unless SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_ANON_KEY are set.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { SupabaseStore } from "../../src/store/supabase.ts";
import { demoConfig } from "../fixtures.ts";

const url = process.env.SUPABASE_TEST_URL ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const run = `d${Date.now().toString(36)}`;
const today = new Date().toISOString().slice(0, 10);

type Ids = { client: string; draft: string; thread: string };

describe.skipIf(!url || !serviceKey || !anonKey)("dashboard access rules", () => {
  let store: SupabaseStore;
  const ids: Record<"a" | "b", Ids> = { a: { client: "", draft: "", thread: "" }, b: { client: "", draft: "", thread: "" } };
  const users: Record<"ownerA" | "staffA" | "agency", SupabaseClient> = {} as never;

  async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const res = await p;
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  async function signIn(name: string, assign: (userId: string) => PromiseLike<{ error: { message: string } | null }>) {
    const email = `${name}-${run}@example.com`;
    const password = `Pw-${run}-x9!`;
    const created = await store.db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(created.error.message);
    const assigned = await assign(created.data.user!.id);
    if (assigned.error) throw new Error(assigned.error.message);
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error(signed.error.message);
    return client;
  }

  beforeAll(async () => {
    store = new SupabaseStore(url, serviceKey);
    for (const key of ["a", "b"] as const) {
      const slug = `${run}-${key}`;
      const config = demoConfig((c) => { c.client_id = slug; c.name = `Clinic ${key.toUpperCase()}`; });
      const client = await must(store.db.from("clients").insert({
        slug, name: config.name, vertical: config.vertical, region: config.region, timezone: config.timezone, status: "demo", config,
      }).select("id").single()) as { id: string };
      ids[key].client = client.id;
      const contact = await store.insertContact({ client_id: client.id, phone: key === "a" ? "+61411110001" : "+61411110002", name: `Patient ${key}` });
      const thread = await store.insertThread({ client_id: client.id, contact_id: contact.id, channel: "whatsapp" });
      ids[key].thread = thread.id;
      await store.insertMessage({ client_id: client.id, thread_id: thread.id, direction: "inbound", author: "customer", channel: "whatsapp", body: `Where is the parking near clinic ${key}?` });
      await must(store.db.from("metrics_daily").insert({ client_id: client.id, day: today, enquiries: 7, bookings: 3, revenue_influenced: 540, revenue_currency: "AUD", llm_cost_usd: 1.25 }));
      const draft = await must(store.db.from("reply_drafts").insert({
        client_id: client.id, helpdesk: "zendesk", external_ticket_id: `T-${key}`, customer_message: "Can I change my booking?", draft_body: "Of course, which day suits you?",
      }).select("id").single()) as { id: string };
      ids[key].draft = draft.id;
      await must(store.db.from("client_resources").insert({ client_id: client.id, kind: "quick_guide", title: `Guide ${key}`, url: "https://example.com/guide" }));
      await must(store.db.from("invoices").insert([
        { client_id: client.id, number: `INV-${key}-1`, kind: "deposit", amount: 1250, issued_on: today, status: "paid" },
        { client_id: client.id, number: `INV-${key}-2`, kind: "go_live", amount: 1250, issued_on: today, status: "draft" },
      ]));
    }
    users.ownerA = await signIn("owner", (id) => store.db.rpc("assign_client_role", { p_user_id: id, p_client_slug: `${run}-a`, p_role: "owner" }));
    users.staffA = await signIn("staff", (id) => store.db.rpc("assign_client_role", { p_user_id: id, p_client_slug: `${run}-a`, p_role: "staff" }));
    users.agency = await signIn("agency", (id) => store.db.rpc("assign_agency_role", { p_user_id: id }));
  });

  it("staff of client A cannot read anything of client B (Phase 3 exit criterion)", async () => {
    const staff = users.staffA;
    for (const table of ["contacts", "threads", "messages", "reply_drafts", "client_resources", "bookings", "leads", "escalations"]) {
      const res = await staff.from(table).select("client_id");
      expect(res.error, table).toBeNull();
      expect(res.data!.every((r: { client_id: string }) => r.client_id === ids.a.client), table).toBe(true);
    }
    expect((await staff.from("messages").select("id")).data!.length).toBeGreaterThan(0);
    expect((await staff.from("clients").select("id")).data!.map((c) => c.id)).toEqual([ids.a.client]);
    expect((await staff.from("threads").select("id").eq("id", ids.b.thread)).data).toEqual([]);
    expect(await must(staff.rpc("dashboard_metrics", { p_client: ids.b.client, p_from: today, p_to: today }))).toEqual([]);
    expect(await must(staff.rpc("search_messages", { p_client: ids.b.client, p_query: "parking" }))).toEqual([]);
  });

  it("staff see operational metrics but no money", async () => {
    const staff = users.staffA;
    expect((await staff.from("metrics_daily").select("day")).data).toEqual([]);
    expect((await staff.from("invoices").select("id")).data).toEqual([]);
    expect((await staff.from("usage_events").select("id")).data).toEqual([]);
    const rows = await must(staff.rpc("dashboard_metrics", { p_client: ids.a.client, p_from: today, p_to: today })) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enquiries: 7, bookings: 3, revenue_influenced: null, revenue_currency: null, llm_cost_usd: null });
    expect(await must(staff.rpc("my_memberships"))).toEqual([expect.objectContaining({ client_id: ids.a.client, role: "staff" })]);
    expect(await must(staff.rpc("agency_health"))).toEqual([]);
    expect(await must(staff.rpc("is_agency_user"))).toBe(false);
  });

  it("owners see money and issued invoices for their own client only", async () => {
    const owner = users.ownerA;
    const rows = await must(owner.rpc("dashboard_metrics", { p_client: ids.a.client, p_from: today, p_to: today })) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ revenue_influenced: 540, revenue_currency: "AUD", llm_cost_usd: 1.25 });
    expect((await owner.from("metrics_daily").select("client_id")).data!.map((r) => r.client_id)).toEqual([ids.a.client]);
    expect((await owner.from("invoices").select("number")).data!.map((r) => r.number)).toEqual([`INV-a-1`]);   // drafts hidden
    expect(await must(owner.rpc("my_memberships"))).toEqual([expect.objectContaining({ slug: `${run}-a`, role: "owner" })]);
  });

  it("agency sees every client, including draft invoices and health", async () => {
    const agency = users.agency;
    expect(await must(agency.rpc("is_agency_user"))).toBe(true);
    const memberships = await must(agency.rpc("my_memberships")) as { client_id: string; role: string }[];
    expect(memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({ client_id: ids.a.client, role: "agency" }),
      expect.objectContaining({ client_id: ids.b.client, role: "agency" }),
    ]));
    const invoices = await must(agency.from("invoices").select("number").in("client_id", [ids.a.client, ids.b.client])) as { number: string }[];
    expect(invoices).toHaveLength(4);
    const health = await must(agency.rpc("agency_health")) as { client_id: string; messages: number }[];
    expect(health.find((h) => h.client_id === ids.b.client)?.messages).toBe(1);
  });

  it("searches transcripts with safe highlight markers", async () => {
    const hits = await must(users.staffA.rpc("search_messages", { p_client: ids.a.client, p_query: "parking" })) as { thread_id: string; snippet: string; contact_name: string }[];
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ thread_id: ids.a.thread, contact_name: "Patient a" });
    expect(hits[0]!.snippet).toContain("\u0002parking\u0003");
    expect(hits[0]!.snippet).not.toContain("<");
  });

  it("decides drafts only for the caller's client, once, with an audit row", async () => {
    const staff = users.staffA;
    const other = await staff.rpc("decide_reply_draft", { p_id: ids.b.draft, p_action: "approve" });
    expect(other.error?.message).toMatch(/draft not found/);

    const approved = await must(staff.rpc("decide_reply_draft", { p_id: ids.a.draft, p_action: "approve", p_body: "Of course! Which day works best?" })) as Record<string, unknown>;
    expect(approved).toMatchObject({ status: "approved", final_body: "Of course! Which day works best?" });
    expect(approved.decided_at).toBeTruthy();

    const again = await staff.rpc("decide_reply_draft", { p_id: ids.a.draft, p_action: "reject" });
    expect(again.error?.message).toMatch(/already decided/);

    const audit = await must(store.db.from("audit_log").select("action, detail").eq("client_id", ids.a.client).eq("action", "reply_draft_approved")) as { detail: { edited: boolean } }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]!.detail.edited).toBe(true);

    const direct = await staff.from("reply_drafts").update({ status: "sent" }).eq("id", ids.a.draft).select("id");
    expect(direct.data ?? []).toEqual([]);   // no update policy: the RPC is the only write path
  });

  it("buckets enquiries by local weekday and hour, scoped like messages", async () => {
    const rows = await must(users.staffA.rpc("enquiry_hours", { p_client: ids.a.client, p_from: "2000-01-01", p_to: "2100-01-01" })) as { weekday: number; hour: number; enquiries: number }[];
    expect(rows.reduce((n, r) => n + r.enquiries, 0)).toBe(1);
    expect(rows[0]!.weekday).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.hour).toBeLessThan(24);
    expect(await must(users.staffA.rpc("enquiry_hours", { p_client: ids.b.client, p_from: "2000-01-01", p_to: "2100-01-01" }))).toEqual([]);
  });

  it("gives anonymous callers nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.rpc("my_memberships")).error).not.toBeNull();
    expect((await anon.from("reply_drafts").select("id")).data ?? []).toEqual([]);
  });
});
