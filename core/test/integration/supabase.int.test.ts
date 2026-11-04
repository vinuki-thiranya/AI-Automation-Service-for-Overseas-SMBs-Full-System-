// Integration tests against a real Supabase stack (CI: `supabase start` + migrations). Skipped unless
// SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_ANON_KEY are set.
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { SupabaseStore } from "../../src/store/supabase.ts";
import { demoConfig } from "../fixtures.ts";

const url = process.env.SUPABASE_TEST_URL ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const run = Date.now().toString(36);

/** A 1536-d unit vector pointing mostly along `axis`. */
const vec = (axis: number, wobble = 0) => Array.from({ length: 1536 }, (_, i) => (i === axis ? 1 : i === axis + 1 ? wobble : 0));

describe.skipIf(!url || !serviceKey || !anonKey)("SupabaseStore against a real database", () => {
  // Created in beforeAll: the describe body also runs when the suite is skipped, and supabase-js throws on an empty URL.
  let store: SupabaseStore;
  const slugA = `int-a-${run}`;
  const slugB = `int-b-${run}`;
  let clientA = "";
  let clientB = "";

  beforeAll(async () => {
    store = new SupabaseStore(url, serviceKey);
    for (const slug of [slugA, slugB]) {
      const config = demoConfig((c) => { c.client_id = slug; });
      const res = await store.db.from("clients").insert({
        slug, name: config.name, vertical: config.vertical, region: config.region, timezone: config.timezone, status: "demo", config,
      }).select("id").single();
      if (res.error) throw new Error(res.error.message);
      if (slug === slugA) clientA = (res.data as { id: string }).id;
      else clientB = (res.data as { id: string }).id;
    }
  });

  it("loads and validates clients", async () => {
    const a = await store.getClientBySlug(slugA);
    expect(a).toMatchObject({ id: clientA, slug: slugA, region: "au", status: "demo" });
    expect(a!.config.business.services.length).toBeGreaterThan(0);
    expect((await store.listActiveClients()).map((c) => c.slug)).toEqual(expect.arrayContaining([slugA, slugB]));
  });

  it("stores contacts, links channels, dedupes messages and counts inbound", async () => {
    const contact = await store.insertContact({ client_id: clientA, phone: "+61411111111", name: "Alex" });
    await store.linkChannel(clientA, "whatsapp", "61411111111", contact.id);
    await store.linkChannel(clientA, "whatsapp", "61411111111", contact.id);   // idempotent
    expect((await store.findContactByChannel(clientA, "whatsapp", "61411111111"))?.id).toBe(contact.id);
    expect((await store.findContactByPhone(clientA, "+61411111111"))?.id).toBe(contact.id);
    expect(await store.findContactByPhone(clientB, "+61411111111")).toBeNull();

    const thread = await store.insertThread({ client_id: clientA, contact_id: contact.id, channel: "whatsapp" });
    expect(thread.state).toEqual({});
    await store.updateThread(thread.id, { state: { offered_slots: [] }, last_inbound_at: new Date().toISOString() });
    const msg = { client_id: clientA, thread_id: thread.id, direction: "inbound" as const, author: "customer" as const, channel: "whatsapp" as const, body: "hi", provider_message_id: "wamid.int.1" };
    expect((await store.insertMessage(msg)).duplicate).toBe(false);
    expect((await store.insertMessage(msg)).duplicate).toBe(true);
    expect(await store.countInbound(clientA, contact.id, new Date(Date.now() - 3600_000).toISOString())).toBe(1);
    expect((await store.listThreadMessages(thread.id, 10)).map((m) => m.body)).toEqual(["hi"]);
  });

  it("upserts bookings idempotently on (client, adapter, external id)", async () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 86_400_000 + 45 * 60_000).toISOString();
    const a = await store.upsertBooking({ client_id: clientA, adapter: "fake", external_booking_id: "ext-1", starts_at: start, ends_at: end });
    const b = await store.upsertBooking({ client_id: clientA, adapter: "fake", external_booking_id: "ext-1", starts_at: start, ends_at: end, practitioner: "Dr X" });
    expect(b.id).toBe(a.id);
    expect(b.practitioner).toBe("Dr X");
    expect((await store.updateBooking(a.id, { reminders_sent: ["24h"] })).reminders_sent).toEqual(["24h"]);
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const contact = await store.insertContact({ client_id: clientA, phone: "+61422222222" });
    const thread = await store.insertThread({ client_id: clientA, contact_id: contact.id, channel: "sms" });
    const esc = await store.insertEscalation({ client_id: clientA, thread_id: thread.id, reason: "customer_request", summary: "test", claim_code: "1234" });
    const [x, y] = await Promise.all([
      store.claimEscalation(esc.id, "+61400000003", "Jess", new Date().toISOString()),
      store.claimEscalation(esc.id, "+61400000004", "Front desk", new Date().toISOString()),
    ]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
    expect((await store.getEscalation(esc.id))?.status).toBe("claimed");
  });

  it("marks scheduled work once and sums usage", async () => {
    expect(await store.markOnce(clientA, "weekly:2026-11-09")).toBe(true);
    expect(await store.markOnce(clientA, "weekly:2026-11-09")).toBe(false);
    await store.insertUsage([{ client_id: clientA, provider: "anthropic", kind: "chat", model: "claude-sonnet-5-5", units: 100, cost_usd: 0.25 }]);
    expect(await store.sumUsageSince(clientA, new Date(Date.now() - 60_000).toISOString())).toBeCloseTo(0.25, 6);
  });

  it("retrieves the nearest FAQ chunk with pgvector, scoped to the client", async () => {
    await store.replaceFaqChunks(clientA, [
      { source: "faq", content: "parking", embedding: vec(1) },
      { source: "faq", content: "afterpay", embedding: vec(5) },
      { source: "faq", content: "children", embedding: vec(9) },
    ]);
    await store.replaceFaqChunks(clientB, [{ source: "faq", content: "other clinic", embedding: vec(5) }]);
    const hits = await store.matchFaq(clientA, vec(5, 0.1), 2);
    expect(hits[0]).toMatchObject({ content: "afterpay" });
    expect(hits[0]!.similarity).toBeGreaterThan(0.9);
    expect(hits.map((h) => h.content)).not.toContain("other clinic");
  });

  it("stores client secrets in Vault, service role only", async () => {
    const ref = `${slugA}/integration`;
    expect((await store.db.rpc("put_client_secret", { p_ref: ref, p_value: "v1" })).error).toBeNull();
    expect((await store.db.rpc("put_client_secret", { p_ref: ref, p_value: "v2" })).error).toBeNull();
    expect((await store.db.rpc("get_client_secret", { p_ref: ref })).data).toBe("v2");
    expect((await store.db.rpc("list_client_secret_refs", { p_client_slug: slugA })).data).toContain(ref);
    expect((await store.db.rpc("put_client_secret", { p_ref: "not a ref", p_value: "x" })).error).not.toBeNull();
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const denied = await anon.rpc("get_client_secret", { p_ref: ref });
    expect(denied.error).not.toBeNull();
    expect(denied.data).toBeNull();
  });

  it("row-level security: an owner of client A sees A's rows and nothing of client B", async () => {
    const contactB = await store.insertContact({ client_id: clientB, phone: "+61433333333", name: "B customer" });
    expect(contactB.id).toBeTruthy();
    const email = `owner-${run}@example.com`;
    const password = `Pw-${run}-x9!`;
    const created = await store.db.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    expect((await store.db.rpc("assign_client_role", { p_user_id: created.data.user!.id, p_client_slug: slugA, p_role: "owner" })).error).toBeNull();

    const user = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await user.auth.signInWithPassword({ email, password })).error).toBeNull();
    const contacts = await user.from("contacts").select("client_id");
    expect(contacts.error).toBeNull();
    expect(contacts.data!.length).toBeGreaterThan(0);
    expect(new Set(contacts.data!.map((c) => c.client_id))).toEqual(new Set([clientA]));
    expect((await user.from("clients").select("slug")).data!.map((c) => c.slug)).toEqual([slugA]);
    const write = await user.from("contacts").insert({ client_id: clientA, phone: "+61444444444" });
    expect(write.error).not.toBeNull();   // dashboard users are read-only until Phase 3 adds narrow write policies

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("contacts").select("id")).data ?? []).toEqual([]);
  });

  it("purges transcripts past the client's retention window", async () => {
    const contact = await store.insertContact({ client_id: clientA, phone: "+61455555555" });
    const thread = await store.insertThread({ client_id: clientA, contact_id: contact.id, channel: "sms" });
    const old = await store.db.from("messages").insert({
      client_id: clientA, thread_id: thread.id, direction: "inbound", author: "customer", channel: "sms", body: "old",
      created_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
    }).select("id").single();
    expect(old.error).toBeNull();
    const purged = await store.db.rpc("purge_expired_transcripts");
    expect(purged.error).toBeNull();
    expect(purged.data).toBeGreaterThanOrEqual(1);
    expect((await store.db.from("messages").select("id").eq("id", (old.data as { id: string }).id)).data).toEqual([]);
  });
});
