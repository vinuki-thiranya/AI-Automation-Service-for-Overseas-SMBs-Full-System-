// Seeds the two demo clients with 90 days of realistic, fictional activity for the dashboard.
//   node scripts/seed-demo.ts            → wipes and re-creates demo-clinic + demo-physio data
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. Refuses to touch any
// client whose status isn't 'demo'. metrics_daily is filled by core's real nightly rollup, not invented.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DateTime } from "luxon";
import { REPO_ROOT, readClientConfigFile, type Client, type ClientConfig } from "../core/src/config/index.ts";
import type { Ctx } from "../core/src/context.ts";
import { loadLocalEnv } from "../core/src/localenv.ts";
import { rollupDay } from "../core/src/reporting.ts";
import { SupabaseStore } from "../core/src/store/supabase.ts";

const DAYS = 90;
const SLUGS = ["demo-clinic", "demo-physio"] as const;
const CHILD_TABLES = ["reply_drafts", "invoices", "client_resources", "audit_log", "usage_events", "metrics_daily",
  "escalations", "leads", "bookings", "messages", "threads", "contact_channels", "contacts"];

loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const store = new SupabaseStore(url, serviceKey);
const db = store.db;

// Deterministic randomness so every seed looks the same.
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = prng(1);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
async function insertAll(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) await must(db.from(table).insert(rows.slice(i, i + 500)), `insert ${table}`);
}

const FIRST = ["Olivia", "Liam", "Mia", "Noah", "Charlotte", "Jack", "Amelia", "Oliver", "Isla", "William", "Ava", "Thomas", "Grace",
  "Lucas", "Chloe", "Ethan", "Zoe", "Arjun", "Mei", "Hamish", "Priya", "Daniel", "Sofia", "Kai", "Fatima", "Lachlan", "Ruby",
  "Mohammed", "Ella", "Hiroshi", "Aisha", "Connor", "Leila", "Tane", "Ines", "Ravi", "Hannah", "Minh", "Georgia", "Samir"];
const LAST = ["Smith", "Nguyen", "Brown", "Wilson", "Taylor", "Chen", "Singh", "Martin", "Kelly", "Patel", "Walker", "Tran",
  "Murphy", "Khan", "O'Brien", "Lee", "Rossi", "Kaur", "Wright", "Ahmed", "Campbell", "Wong", "Fraser", "Silva"];

type Turn = [author: "customer" | "assistant" | "staff", text: string];
type Script = { kind: "faq" | "booking" | "cancel" | "escalation" | "missed_call" | "after_hours"; service?: string; turns: Turn[]; reason?: string };

const SCRIPTS: Record<"dental" | "physio", Script[]> = {
  dental: [
    { kind: "booking", service: "check-up-clean", turns: [
      ["customer", "Hi, can I book a check-up and clean sometime next week?"],
      ["assistant", "Hi, I'm Ava, Harbourside Dental's virtual assistant. Happy to help. I have Tuesday 10:15am or Thursday 2:30pm with Dr Chen. Which suits?"],
      ["customer", "Thursday 2:30 please"],
      ["assistant", "Done. You're booked for a check-up and clean on Thursday at 2:30pm with Dr Chen. It's $220, gap-free with most health funds. See you then."]] },
    { kind: "booking", service: "new-patient-exam", turns: [
      ["customer", "I'm new to the area and need a dentist. Do you take new patients?"],
      ["assistant", "We do. A new patient exam with x-rays is 60 minutes and $280. I can offer Monday 9am or Wednesday 3pm. Would either work?"],
      ["customer", "Monday 9 is good. It's for Sam Taylor"],
      ["assistant", "All set, Sam: new patient exam on Monday at 9:00am. I'll text you the new patient form now so you can fill it in before you come."]] },
    { kind: "faq", turns: [
      ["customer", "Where can I park?"],
      ["assistant", "There's two-hour street parking on Example Street, and the Wilson car park is 150 m away."]] },
    { kind: "faq", turns: [
      ["customer", "Do you do Afterpay?"],
      ["assistant", "Yes, Afterpay is available for treatments over $300. We also take card and HICAPS on the spot."]] },
    { kind: "faq", turns: [
      ["customer", "Are you open Saturday?"],
      ["assistant", "Yes, Saturdays 9am to 1pm. Would you like me to find you a Saturday time?"],
      ["customer", "No thanks, just checking"]] },
    { kind: "faq", turns: [
      ["customer", "How much is teeth whitening?"],
      ["assistant", "The whitening consultation is free. The dentist will give you a written price for treatment at that visit. Want me to book one?"]] },
    { kind: "cancel", turns: [
      ["customer", "I need to cancel my appointment on Friday, sorry"],
      ["assistant", "No problem, your Friday appointment is cancelled. Would you like to pick another time now?"],
      ["customer", "I'll message next week"]] },
    { kind: "escalation", reason: "customer_request", turns: [
      ["customer", "I was charged twice for my last visit, can someone look at it?"],
      ["assistant", "Sorry about that. I've passed this to Jess, our practice manager, and she'll reply here shortly."],
      ["staff", "Hi, Jess here. I can see the duplicate charge and I've refunded it now. It should show in 2–3 business days."]] },
    { kind: "escalation", reason: "low_confidence", turns: [
      ["customer", "Can I bring my mum to her appointment and sit in with her? She has dementia"],
      ["assistant", "Of course you're welcome. I'll ask a team member to note it on her booking and confirm any details with you."],
      ["staff", "Hi, it's the front desk. Absolutely, we've added a note and booked a longer slot so there's no rush."]] },
    { kind: "after_hours", turns: [
      ["customer", "My tooth is really sore and my cheek is swelling up"],
      ["assistant", "I'm sorry you're in pain. For a dental emergency after hours, call the Sydney Dental Hospital emergency line, or 000 if it's life-threatening. I can also book you the first emergency slot tomorrow at 8am."],
      ["customer", "Yes please book it"],
      ["assistant", "Booked: emergency appointment tomorrow at 8:00am. If the swelling spreads or you have trouble breathing, call 000."]], service: "emergency" },
    { kind: "missed_call", turns: [
      ["assistant", "Hi, sorry we missed your call to Harbourside Dental. I'm Ava, the clinic's virtual assistant. How can I help?"],
      ["customer", "Was just calling to book a clean"],
      ["assistant", "Easy. I have tomorrow 11:30am or Friday 8:45am. Which suits?"],
      ["customer", "Friday"],
      ["assistant", "You're booked for a check-up and clean on Friday at 8:45am. See you then."]], service: "check-up-clean" },
  ],
  physio: [
    { kind: "booking", service: "initial-consult", turns: [
      ["customer", "Hi, I've hurt my knee running. Can I get in this week?"],
      ["assistant", "Hi, I'm Max, Northside Physio's virtual assistant. Sorry to hear that. I have an initial consultation with Tom tomorrow at 7:30am or Thursday at 5pm. Which works?"],
      ["customer", "Thursday 5"],
      ["assistant", "Booked: initial consultation with Tom on Thursday at 5:00pm, 60 minutes, $120. Wear shorts if you can."]] },
    { kind: "booking", service: "clinical-pilates", turns: [
      ["customer", "Do you have a clinical pilates class Saturday morning?"],
      ["assistant", "Yes, Priya runs one at 9am on Saturday and there's a spot left. It's $45. Shall I book you in?"],
      ["customer", "Yes thanks"],
      ["assistant", "You're in: Clinical Pilates, Saturday 9:00am with Priya."]] },
    { kind: "faq", turns: [
      ["customer", "Do I need a referral from my GP?"],
      ["assistant", "No, you can book directly. If you have a GP care plan, bring it to your first visit."]] },
    { kind: "faq", turns: [
      ["customer", "Can I claim on Bupa?"],
      ["assistant", "Yes, with extras cover. We claim on the spot via HICAPS so you only pay the gap."]] },
    { kind: "faq", turns: [
      ["customer", "Is there parking?"],
      ["assistant", "Yes, free customer parking behind the building. The entry is via Example Lane."]] },
    { kind: "cancel", turns: [
      ["customer", "Sorry need to cancel tomorrow's appointment, I'm sick"],
      ["assistant", "Get well soon. Your appointment tomorrow is cancelled. Message me when you're ready to rebook."]] },
    { kind: "escalation", reason: "customer_request", turns: [
      ["customer", "I have a WorkSafe claim, can you bill them directly?"],
      ["assistant", "We can once the claim is approved. I've asked Ben, our clinic coordinator, to check your claim details with you."],
      ["staff", "Hi, Ben here. Send me your claim number and I'll set up direct billing before your next visit."]] },
    { kind: "after_hours", turns: [
      ["customer", "Rolled my ankle at footy tonight, it's really swollen. Can I come in tomorrow?"],
      ["assistant", "Sorry to hear it. If you can't put any weight on it or it looks deformed, please see a GP or go to emergency. Otherwise I can book Tom at 7am tomorrow."],
      ["customer", "Can walk on it a bit. 7am please"],
      ["assistant", "Booked: initial consultation with Tom tomorrow at 7:00am."]], service: "initial-consult" },
    { kind: "missed_call", turns: [
      ["assistant", "Hi, sorry we missed your call to Northside Physio. I'm Max, the clinic's virtual assistant. How can I help?"],
      ["customer", "Just wanted to know if you do dry needling"],
      ["assistant", "Yes, as a $30 add-on to a consultation. Want me to book you in?"]] },
  ],
};

const TICKETS = [
  ["Receipt for health fund", "Hi, can you send me a receipt for my last two visits? My fund needs it.", "Hi {name}, I've attached receipts for both visits. You can submit them in your fund's app. Let us know if they need anything else."],
  ["WorkSafe claim", "My claim number is WS-4471. Can you bill them for my sessions from now on?", "Thanks {name}. We've added your claim number and will bill WorkSafe directly once the claim is approved. Until then we'll hold your invoices."],
  ["Change of address", "I've moved, please update my address to 8 Sample St, Coburg.", "Done, {name}. Your address is now 8 Sample St, Coburg."],
  ["Late cancellation fee", "I was charged a late fee but I called the day before. Can you check?", "Hi {name}, sorry about that. Our records show the call the afternoon before, so we've removed the fee."],
  ["Exercise sheet", "Can Tom resend my exercise sheet? I lost it.", "Hi {name}, here's the exercise sheet from your last session with Tom. Any questions about the exercises, bring them to your next visit."],
  ["Pilates pass", "Do you sell 10-class passes for pilates?", "Hi {name}, yes: a 10-class Clinical Pilates pass is $405 (one class free). I can set it up at your next class."],
  ["Invoice for employer", "My employer pays for my treatment. Can invoices go to accounts@example.com?", "Hi {name}, we can do that. From your next visit invoices will be emailed to accounts@example.com."],
  ["Reschedule", "Can I move Thursday's appointment to next week?", "Hi {name}, no problem. Tom has next Thursday at the same time free. Shall I move it?"],
] as const;

function displayName(r: () => number): string {
  return `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
}

async function seedClient(slug: (typeof SLUGS)[number], seed: number) {
  rand = prng(seed);
  const config: ClientConfig = readClientConfigFile(path.join(REPO_ROOT, "config/clients", `${slug}.json`));
  const existing = await must(db.from("clients").select("id, status").eq("slug", slug).maybeSingle(), "find client") as { id: string; status: string } | null;
  if (existing && existing.status !== "demo") throw new Error(`${slug} exists with status '${existing.status}': refusing to overwrite a non-demo client`);
  const row = await must(db.from("clients").upsert({
    slug, name: config.name, vertical: config.vertical, region: config.region, timezone: config.timezone, status: "demo", config,
  }, { onConflict: "slug" }).select("id").single(), "upsert client") as { id: string };
  const clientId = row.id;
  for (const t of CHILD_TABLES) await must(db.from(t).delete().eq("client_id", clientId), `wipe ${t}`);

  const vertical = config.vertical === "physio" ? "physio" : "dental";
  const scripts = SCRIPTS[vertical];
  const zone = config.timezone;
  const today = DateTime.now().setZone(zone).startOf("day");
  const contacts: Record<string, unknown>[] = [];
  const threads: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const bookings: Record<string, unknown>[] = [];
  const leads: Record<string, unknown>[] = [];
  const escalations: Record<string, unknown>[] = [];
  const usage: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
  const phoneBase = vertical === "dental" ? 61411000000 : 61422000000;
  const pool: { id: string; name: string }[] = [];

  const newContact = (at: DateTime) => {
    const c = { id: randomUUID(), name: displayName(rand) };
    contacts.push({ id: c.id, client_id: clientId, name: c.name, phone: `+${phoneBase + contacts.length + 1}`, created_at: at.toUTC().toISO() });
    pool.push(c);
    return c;
  };

  for (let d = DAYS - 1; d >= 0; d--) {
    const day = today.minus({ days: d });
    const weekday = day.weekday;   // 1 = Mon … 7 = Sun
    const growth = 0.75 + 0.35 * ((DAYS - d) / DAYS);   // volume grows as the clinic leans on it
    const base = weekday === 7 ? 2 : weekday === 6 ? 5 : vertical === "dental" ? 10 : 8;
    const count = Math.max(1, Math.round(base * growth * between(0.7, 1.3)));
    let dayCost = 0;

    for (let i = 0; i < count; i++) {
      // Hand-offs are the exception: about 1 conversation in 20, not 1 in 5.
      let script = pick(scripts);
      if (script.kind === "escalation" && !chance(0.3)) script = pick(scripts.filter((s) => s.kind !== "escalation"));
      const afterHours = script.kind === "after_hours";
      const hour = afterHours ? pick([6, 20, 21, 22]) : between(8, 18);
      let at = day.plus({ hours: hour, minutes: between(0, 59) });
      if (d === 0 && at > DateTime.now()) at = DateTime.now().minus({ minutes: between(5, 120) });
      const returning = pool.length > 20 && chance(0.3);
      const contact = returning ? pick(pool) : newContact(at);
      const channel = script.kind === "missed_call" ? "sms" : pick(["whatsapp", "whatsapp", "whatsapp", "sms", "webchat"] as const);
      const threadId = randomUUID();
      let t = at;
      let lastInbound: DateTime | null = null;
      let tools: string[] = [];
      script.turns.forEach(([author, text], idx) => {
        if (idx > 0) t = t.plus({ seconds: author === "staff" ? between(90, 900) : author === "assistant" ? between(3, 14) : between(20, 240) });
        if (author === "customer") lastInbound = t;
        const last = idx === script.turns.length - 1;
        tools = author === "assistant" && last && (script.kind === "booking" || script.service) ? ["book_appointment"]
          : author === "assistant" && script.kind === "cancel" ? ["cancel"] : [];
        const metadata: Record<string, unknown> = author === "assistant"
          ? { model: "claude-sonnet-5-5", latency_ms: Math.round(between(1800, 6500)), tools, ...(script.kind === "missed_call" && idx === 0 ? { missed_call: true } : {}) }
          : {};
        messages.push({
          id: randomUUID(), client_id: clientId, thread_id: threadId, direction: author === "customer" ? "inbound" : "outbound",
          author, channel, body: text, metadata, created_at: t.toUTC().toISO(),
        });
      });
      threads.push({
        id: threadId, client_id: clientId, contact_id: contact.id, channel,
        status: d === 0 && script.kind === "escalation" ? "human" : d < 1 ? "ai" : "closed",
        disclosed_at: at.toUTC().toISO(), last_inbound_at: (lastInbound ?? at as DateTime).toUTC().toISO(), last_message_at: t.toUTC().toISO(), created_at: at.toUTC().toISO(),
      });
      if (script.service) {
        const service = config.business.services.find((s) => s.id === script.service)!;
        const starts = at.plus({ days: Math.round(between(1, 9)) }).set({ hour: Math.round(between(8, 16)), minute: pick([0, 15, 30, 45]) });
        const past = starts < DateTime.now();
        bookings.push({
          client_id: clientId, contact_id: contact.id, thread_id: threadId, adapter: config.booking?.adapter ?? "google_calendar",
          external_booking_id: `demo-${randomUUID().slice(0, 8)}`, service_id: service.id,
          practitioner: config.booking?.calendars?.length ? pick(config.booking.calendars).practitioner : null,
          starts_at: starts.toUTC().toISO(), ends_at: starts.plus({ minutes: service.duration_minutes }).toUTC().toISO(),
          status: past ? (chance(0.93) ? "attended" : "no_show") : "booked", created_at: t.toUTC().toISO(),
        });
      }
      if (script.kind === "escalation") {
        const staff = config.escalation.staff[0]!;
        const resolved = d > 0 || chance(0.5);
        escalations.push({
          client_id: clientId, thread_id: threadId, reason: script.reason ?? "customer_request",
          summary: script.turns[0]![1].slice(0, 140), status: resolved ? "resolved" : "open",
          claimed_by: resolved ? staff.phone : null, claimed_by_name: resolved ? staff.name : null,
          created_at: at.plus({ seconds: 12 }).toUTC().toISO(),
          claimed_at: resolved ? at.plus({ minutes: between(2, 9) }).toUTC().toISO() : null,
          resolved_at: resolved ? at.plus({ minutes: between(10, 40) }).toUTC().toISO() : null,
        });
      }
      const turnsAi = script.turns.filter(([a]) => a === "assistant").length;
      dayCost += turnsAi * between(0.004, 0.011);
    }

    // Package B: leads from the web form and ads, scored hot / warm / cold.
    if (config.packages.includes("B")) {
      for (let i = 0; i < Math.round(between(0, 3.4) * growth); i++) {
        const received = day.plus({ hours: between(7, 22), minutes: between(0, 59) });
        if (received > DateTime.now()) continue;
        const contact = newContact(received);
        const score = Math.round(between(1, 10) * 10) / 10;
        const grade = score >= 7.5 ? "hot" : score >= 4.5 ? "warm" : "cold";
        leads.push({
          client_id: clientId, contact_id: contact.id, source: pick(["web_form", "facebook_lead_ads", "webchat", "whatsapp"]),
          answers: { treatment: pick(["Invisalign", "Whitening", "Check-up", "Just browsing"]), timeline: pick(["This month", "In 1-3 months", "Not sure yet"]) },
          rule_score: score, score, grade, status: grade === "hot" ? pick(["booked", "won", "qualifying"]) : grade === "warm" ? "nurturing" : "archived",
          received_at: received.toUTC().toISO(), first_response_at: received.plus({ seconds: between(8, 75) }).toUTC().toISO(),
        });
        dayCost += 0.006;
      }
    }

    const dayIso = day.plus({ hours: 23 }).toUTC().toISO();
    usage.push({ client_id: clientId, provider: "anthropic", kind: "chat", model: "claude-sonnet-5-5", units: Math.round(dayCost * 90_000), cost_usd: Math.round(dayCost * 10000) / 10000, occurred_at: d === 0 ? DateTime.now().toUTC().toISO() : dayIso });
    usage.push({ client_id: clientId, provider: "anthropic", kind: "classifier", model: "claude-haiku-5-5", units: count * 400, cost_usd: Math.round(count * 0.0006 * 10000) / 10000, occurred_at: d === 0 ? DateTime.now().toUTC().toISO() : dayIso });
    if (chance(0.06)) audit.push({ client_id: clientId, actor: "core:whatsapp", action: "delivery_failed", detail: { demo: true }, created_at: dayIso });
    if (chance(0.04)) audit.push({ client_id: clientId, actor: "core:guardrail", action: "prompt_injection_blocked", detail: { demo: true }, created_at: dayIso });
  }

  await insertAll("contacts", contacts);
  await insertAll("threads", threads);
  await insertAll("messages", messages);
  await insertAll("bookings", bookings);
  await insertAll("leads", leads);
  await insertAll("escalations", escalations);
  await insertAll("usage_events", usage);
  await insertAll("audit_log", audit);

  // Package D approval queue.
  if (config.packages.includes("D")) {
    const drafts = TICKETS.flatMap(([subject, message, draft], i) => [0, 1].map((k) => {
      const name = displayName(rand);
      const created = DateTime.now().minus({ hours: k === 0 ? between(0.2, 20) : between(30, 24 * 20) });
      const decided = k === 1;
      const action = decided ? (chance(0.85) ? "approved" : "rejected") : "pending";
      return {
        client_id: clientId, helpdesk: "freshdesk", external_ticket_id: `FD-${1200 + i * 2 + k}`, customer_name: name, subject,
        customer_message: message, draft_body: draft.replace("{name}", name.split(" ")[0]!), confidence: Math.round(between(0.62, 0.97) * 100) / 100,
        status: action, final_body: action === "approved" ? draft.replace("{name}", name.split(" ")[0]!) : null,
        decided_at: decided ? created.plus({ minutes: between(4, 90) }).toUTC().toISO() : null,
        decision_note: action === "rejected" ? "Handled by phone instead" : null, created_at: created.toUTC().toISO(),
      };
    }));
    await insertAll("reply_drafts", drafts);
  }

  // Invoices (USD, spec §6.7: 50% deposit, 50% at go-live, care plan monthly, usage pass-through).
  const setup = vertical === "dental" ? 4000 : 5500;             // A+B bundle; A + D
  const care = config.care_plan === "partner" ? 1000 : 600;
  const start = today.minus({ days: DAYS + 20 });
  const invoices: Record<string, unknown>[] = [
    { number: "DEP", kind: "deposit", description: `Setup deposit (50%), packages ${config.packages.join(" + ")}`, amount: setup / 2, issued_on: start, status: "paid", paid: 3 },
    { number: "GOL", kind: "go_live", description: "Setup balance at go-live (50%)", amount: setup / 2, issued_on: start.plus({ days: 16 }), status: "paid", paid: 5 },
  ];
  for (let m = 0; m < 3; m++) {
    const month = today.minus({ months: 2 - m }).startOf("month");
    const current = m === 2;
    invoices.push({ number: `CARE-${month.toFormat("yyyyLL")}`, kind: "care_plan", description: `${config.care_plan === "partner" ? "Partner" : "Grow"} care plan, ${month.toFormat("LLLL yyyy")}`,
      amount: care, issued_on: month, status: current ? "sent" : "paid", paid: current ? null : 4, period: month });
    if (!current) invoices.push({ number: `USE-${month.toFormat("yyyyLL")}`, kind: "usage", description: `Usage pass-through, ${month.toFormat("LLLL yyyy")} (cost + 20%)`,
      amount: Math.round(between(18, 46) * 100) / 100, issued_on: month.plus({ months: 1 }), status: m === 1 ? "sent" : "paid", paid: m === 1 ? null : 6, period: month });
  }
  invoices.push({ number: `CARE-${today.plus({ months: 1 }).startOf("month").toFormat("yyyyLL")}`, kind: "care_plan", description: "Next month's care plan (draft, agency only)",
    amount: care, issued_on: today.plus({ months: 1 }).startOf("month"), status: "draft", paid: null });
  await insertAll("invoices", invoices.map((inv, i) => {
    const issued = inv.issued_on as DateTime;
    const period = inv.period as DateTime | undefined;
    return {
      client_id: clientId, number: `NV-${slug === "demo-clinic" ? "HD" : "NP"}-${String(i + 1).padStart(3, "0")}`, kind: inv.kind, description: inv.description,
      amount: inv.amount, currency: "USD", status: inv.status, issued_on: issued.toISODate(), due_on: issued.plus({ days: 14 }).toISODate(),
      paid_on: inv.paid ? issued.plus({ days: inv.paid as number }).toISODate() : null, provider: "paypal",
      period_start: period?.toISODate() ?? null, period_end: period?.endOf("month").toISODate() ?? null,
      url: inv.status === "draft" ? null : `https://example.com/demo-invoices/${slug}/${i + 1}`,
    };
  }));

  await insertAll("client_resources", [
    { client_id: clientId, kind: "walkthrough_video", title: "Your system walkthrough (12 min)", url: null, note: "Recorded at go-live. Demo client: no video uploaded.", sort: 1 },
    { client_id: clientId, kind: "quick_guide", title: "Front desk quick guide", url: "https://example.com/quick-guide.pdf", note: "Taking over a chat, pausing the assistant and what the alerts mean.", sort: 2 },
    { client_id: clientId, kind: "support", title: "Support", url: "mailto:support@example.com", note: "Weekdays 9am–5pm AEST. Urgent issues: reply to any alert.", sort: 3 },
  ]);

  // metrics_daily through core's real nightly rollup.
  const client: Client = { id: clientId, slug, region: config.region, status: "demo", config };
  const ctx = { client, store, now: () => new Date(), deps: undefined as never } satisfies Ctx;
  for (let d = DAYS - 1; d >= 0; d--) await rollupDay(ctx, today.minus({ days: d }).toISODate()!);

  console.log(`${slug}: ${contacts.length} contacts, ${threads.length} threads, ${messages.length} messages, ${bookings.length} bookings, ` +
    `${leads.length} leads, ${escalations.length} escalations, ${invoices.length} invoices, ${DAYS} days of metrics`);
}

await seedClient("demo-clinic", 11);
await seedClient("demo-physio", 29);
console.log("Demo data ready. Give yourself access with: node scripts/invite-user.ts <your email> --agency");
