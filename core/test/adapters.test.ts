// Provider adapters against recorded-shape HTTP fakes (no network). These pin the request shapes we send
// and how responses are read; live verification happens during each client's integration days (spec §6.3).
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { AcuityAdapter } from "../src/booking/acuity.ts";
import { CalendlyAdapter } from "../src/booking/calendly.ts";
import { ClinikoAdapter } from "../src/booking/cliniko.ts";
import { GoogleCalendarAdapter, GoogleTokenSource, googleEventId } from "../src/booking/google-calendar.ts";
import { MicrosoftBookingsAdapter } from "../src/booking/microsoft-bookings.ts";
import { LiveChannels, WebchatOutbox } from "../src/channels/index.ts";
import { GoHighLevelCrm, GoogleSheetsCrm, HubSpotCrm, PipedriveCrm } from "../src/crm/adapters.ts";
import { MapSecrets } from "../src/secrets.ts";
import { TEST_ENV } from "../src/testing.ts";
import type { Client } from "../src/config/index.ts";
import { demoConfig, fakeFetch } from "./fixtures.ts";

const tz = "Australia/Sydney";
const service = (over: Record<string, unknown> = {}) => ({ id: "check-up-clean", name: "Check-up and clean", duration_minutes: 45, ...over });
const patient = { name: "Alex Smith", phone: "+61411111111", email: "alex@example.com", isNew: true };
const wed = DateTime.fromISO("2026-11-11T00:00", { zone: tz });
const tokenRoute = { method: "POST", match: /oauth2\.googleapis\.com\/token/, body: { access_token: "ya29.x", expires_in: 3600 } };

describe("Google Calendar", () => {
  const cfg = demoConfig();
  it("turns free/busy into candidates per practitioner calendar", async () => {
    const calA = cfg.booking!.calendars![0]!.id;
    const { fn, calls } = fakeFetch([tokenRoute, {
      method: "POST", match: /freeBusy/, body: { calendars: {
        [calA]: { busy: [{ start: "2026-11-10T21:00:00Z", end: "2026-11-11T05:00:00Z" }] },   // Wed 8am–4pm busy (Sydney)
        [cfg.booking!.calendars![1]!.id]: { busy: [] },
      } },
    }]);
    const g = new GoogleCalendarAdapter(cfg, new GoogleTokenSource({ clientId: "c", clientSecret: "s", refreshToken: "r" }, fn), fn);
    const slots = await g.findCandidates({ service: cfg.business.services[0]!, from: wed, to: wed.plus({ days: 1 }) });
    const chen = slots.filter((s) => s.practitioner === "Dr Maya Chen").map((s) => s.start.setZone(tz).toFormat("HH:mm"));
    expect(chen[0]).toBe("16:15");                                  // 4pm busy end + 15 min buffer
    expect(slots.some((s) => s.practitioner === "Dr Sam Patel" && s.start.setZone(tz).hour === 8)).toBe(true);
    expect(calls[1]!.body).toMatchObject({ timeZone: tz, items: [{ id: calA }, { id: cfg.booking!.calendars![1]!.id }] });
  });

  it("books with a deterministic event id and treats 409 as already booked", async () => {
    const { fn, calls } = fakeFetch([tokenRoute, { method: "POST", match: /\/events$/, status: 409, body: { error: { code: 409 } } }]);
    const g = new GoogleCalendarAdapter(cfg, new GoogleTokenSource({ clientId: "c", clientSecret: "s", refreshToken: "r" }, fn), fn);
    const slot = { start: wed.set({ hour: 9 }), end: wed.set({ hour: 9, minute: 45 }), practitionerId: "cal-1", practitioner: null };
    const res = await g.book({ slot, service: service() as never, patient, notes: "", idempotencyKey: "k1" });
    expect(res.externalId).toBe(`cal-1|${googleEventId("k1")}`);
    expect(googleEventId("k1")).toMatch(/^[a-v0-9]{5,1024}$/);
    expect((calls[1]!.body as { id: string }).id).toBe(googleEventId("k1"));
  });
});

describe("Cliniko", () => {
  const cfg = demoConfig((c) => {
    c.booking = { adapter: "cliniko", credential: "demo-clinic/cliniko", account_id: "111", calendars: [{ id: "222", practitioner: "Dr Maya Chen" }] };
    c.business.services[0]!.external_id = "333";
  });

  it("derives the shard from the API key and pages available_times", async () => {
    const { fn, calls } = fakeFetch([
      { match: /available_times.*page=2/, body: { available_times: [{ appointment_start: "2026-11-11T00:00:00Z" }] } },
      { match: /available_times/, body: { available_times: [{ appointment_start: "2026-11-10T23:00:00Z" }], links: { next: "https://api.au1.cliniko.com/v1/businesses/111/practitioners/222/appointment_types/333/available_times?page=2" } } },
    ]);
    const c = new ClinikoAdapter(cfg, "MS0xLWtleQ-au1", "ops@test.local", fn);
    const slots = await c.findCandidates({ service: cfg.business.services[0]!, from: wed, to: wed.plus({ days: 1 }) });
    expect(slots.map((s) => s.start.setZone(tz).toFormat("HH:mm"))).toEqual(["10:00", "11:00"]);
    expect(calls[0]!.url).toMatch(/^https:\/\/api\.au1\.cliniko\.com\/v1\/businesses\/111\/practitioners\/222\/appointment_types\/333\/available_times\?from=2026-11-11&to=2026-11-12/);
    expect(calls[0]!.headers["User-Agent"]).toBe("Recallo (ops@test.local)");
  });

  it("finds or creates the patient, then books the appointment", async () => {
    const { fn, calls } = fakeFetch([
      { match: /\/patients\?q\[\]=email/, body: { patients: [] } },
      { match: /\/patients\?q\[\]=first_name/, body: { patients: [] } },
      { method: "POST", match: /\/patients$/, body: { id: "p1" } },
      { match: /\/patients\/p1\/appointments/, body: { individual_appointments: [] } },
      { method: "POST", match: /\/individual_appointments$/, body: { id: "a1" } },
    ]);
    const c = new ClinikoAdapter(cfg, "key-au1", "ops@test.local", fn);
    const slot = { start: wed.set({ hour: 10 }), end: wed.set({ hour: 10, minute: 45 }), practitionerId: "222", practitioner: null };
    const res = await c.book({ slot, service: cfg.business.services[0]!, patient, notes: "", idempotencyKey: "k" });
    expect(res.externalId).toBe("a1");
    expect(calls.find((x) => x.method === "POST" && /patients$/.test(x.url))!.body).toMatchObject({
      first_name: "Alex", last_name: "Smith", patient_phone_numbers: [{ phone_type: "Mobile", number: "+61411111111" }],
    });
    expect(calls.at(-1)!.body).toMatchObject({ appointment_type_id: "333", business_id: "111", patient_id: "p1", practitioner_id: "222" });
  });

  it("rejects keys without a shard", () => {
    expect(() => new ClinikoAdapter(cfg, "nokey", "ops@test.local", fetch)).toThrow(/shard/);
  });
});

describe("Acuity / Calendly / Microsoft Bookings", () => {
  it("Acuity reads times per day and requires email to book", async () => {
    const cfg = demoConfig((c) => { c.booking = { adapter: "acuity", credential: "x/y", calendars: [] }; c.business.services[0]!.external_id = "42"; });
    const { fn, calls } = fakeFetch([{ match: /availability\/times/, body: [{ time: "2026-11-11T09:00:00+1100", slotsAvailable: 1 }, { time: "2026-11-11T10:00:00+1100", slotsAvailable: 0 }] }]);
    const a = new AcuityAdapter(cfg, { user_id: "u", api_key: "k" }, fn);
    const slots = await a.findCandidates({ service: cfg.business.services[0]!, from: wed, to: wed.plus({ days: 1 }) });
    expect(slots).toHaveLength(1);
    expect(calls[0]!.url).toContain("appointmentTypeID=42&date=2026-11-11");
    await expect(a.book({ slot: slots[0]!, service: cfg.business.services[0]!, patient: { ...patient, email: null }, notes: "", idempotencyKey: "k" })).rejects.toThrow(/email/);
  });

  it("Calendly books through POST /invitees with the event type URI", async () => {
    const cfg = demoConfig((c) => { c.booking = { adapter: "calendly", credential: "x/y" }; c.business.services[0]!.external_id = "https://api.calendly.com/event_types/ET1"; });
    const { fn, calls } = fakeFetch([{ method: "POST", match: /\/invitees$/, body: { resource: { uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1", event: "https://api.calendly.com/scheduled_events/E1" } } }]);
    const c = new CalendlyAdapter(cfg, "pat", fn);
    const slot = { start: wed.set({ hour: 9 }), end: wed.set({ hour: 9, minute: 45 }), practitionerId: null, practitioner: null };
    const res = await c.book({ slot, service: cfg.business.services[0]!, patient, notes: "", idempotencyKey: "k" });
    expect(res.externalId).toBe("https://api.calendly.com/scheduled_events/E1");
    expect(calls[0]!.body).toMatchObject({ event_type: "https://api.calendly.com/event_types/ET1", start_time: "2026-11-10T22:00:00.000Z", invitee: { email: "alex@example.com", timezone: tz } });
  });

  it("Microsoft Bookings builds slots from staff availability windows", async () => {
    const cfg = demoConfig((c) => { c.booking = { adapter: "microsoft_bookings", credential: "x/y", account_id: "clinic@contoso.com", calendars: [{ id: "staff-1", practitioner: "Dr Chen" }] }; });
    const { fn, calls } = fakeFetch([
      { method: "POST", match: /login\.microsoftonline\.com/, body: { access_token: "t", expires_in: 3600 } },
      { method: "POST", match: /getStaffAvailability/, body: { value: [{ staffId: "staff-1", availabilityItems: [
        { status: "available", startDateTime: { dateTime: "2026-11-11T09:00:00", timeZone: tz }, endDateTime: { dateTime: "2026-11-11T10:30:00", timeZone: tz } },
        { status: "busy", startDateTime: { dateTime: "2026-11-11T10:30:00", timeZone: tz }, endDateTime: { dateTime: "2026-11-11T12:00:00", timeZone: tz } },
      ] }] } },
    ]);
    const m = new MicrosoftBookingsAdapter(cfg, { tenant_id: "t", client_id: "c", client_secret: "s" }, fn);
    const slots = await m.findCandidates({ service: cfg.business.services[0]!, from: wed, to: wed.plus({ days: 1 }) });
    expect(slots.map((s) => s.start.setZone(tz).toFormat("HH:mm"))).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    expect(calls[1]!.url).toContain("/solutions/bookingBusinesses/clinic%40contoso.com/getStaffAvailability");
  });
});

describe("CRM adapters", () => {
  const contact = { name: "Alex Smith", phone: "+61411111111", email: "alex@example.com", externalId: null };

  it("HubSpot searches by email, then updates the found contact with mapped fields", async () => {
    const { fn, calls } = fakeFetch([
      { method: "POST", match: /contacts\/search/, body: { results: [{ id: "h1" }] } },
      { method: "PATCH", match: /contacts\/h1/, body: { id: "h1" } },
    ]);
    const crm = new HubSpotCrm("tok", { lead_grade: "recallo_grade" }, fn);
    expect(await crm.upsertContact(contact, { lead_grade: "hot", unmapped: "x" })).toEqual({ externalId: "h1" });
    expect(calls[1]!.body).toEqual({ properties: { firstname: "Alex", lastname: "Smith", email: "alex@example.com", phone: "+61411111111", recallo_grade: "hot" } });
  });

  it("Pipedrive creates a person when search finds nothing", async () => {
    const { fn, calls } = fakeFetch([
      { match: /persons\/search/, body: { data: { items: [] } } },
      { method: "POST", match: /api\/v2\/persons$/, body: { data: { id: 7 } } },
    ]);
    const crm = new PipedriveCrm("tok", undefined, fn);
    expect(await crm.upsertContact(contact, {})).toEqual({ externalId: "7" });
    expect(calls.at(-1)!.headers["x-api-token"]).toBe("tok");
  });

  it("GoHighLevel upserts with the location id and API version header", async () => {
    const { fn, calls } = fakeFetch([{ method: "POST", match: /contacts\/upsert/, body: { contact: { id: "g1" } } }]);
    const crm = new GoHighLevelCrm("tok", "loc1", { lead_score: "lead_score" }, fn);
    expect(await crm.upsertContact(contact, { lead_score: 8.4, source: "web_form" })).toEqual({ externalId: "g1" });
    expect(calls[0]!.headers.Version).toBe("2021-07-28");
    expect(calls[0]!.body).toMatchObject({ locationId: "loc1", source: "web_form", customFields: [{ key: "lead_score", field_value: 8.4 }] });
  });

  it("Google Sheets updates the matching row instead of appending a duplicate", async () => {
    const { fn, calls } = fakeFetch([
      tokenRoute,
      { match: /values\/Leads!A1%3AZ/, body: { values: [["Name", "Phone", "Email", "Grade"], ["Old", "0411 111 111", "", ""]] } },
      { method: "PUT", match: /values\/Leads!A2/, body: {} },
    ]);
    const crm = new GoogleSheetsCrm(new GoogleTokenSource({ clientId: "c", clientSecret: "s", refreshToken: "r" }, fn), "sheet", "Leads",
      { name: "Name", phone: "Phone", email: "Email", lead_grade: "Grade" }, fn);
    expect(await crm.upsertContact(contact, { lead_grade: "warm" })).toEqual({ externalId: "2" });
    expect(calls.at(-1)!.body).toEqual({ values: [["Alex Smith", "+61411111111", "alex@example.com", "warm"]] });
  });
});

describe("channel senders", () => {
  const cfg = demoConfig((c) => { c.channels.whatsapp!.phone_number_id = "PNID"; });
  const client: Client = { id: "c1", slug: "demo-clinic", region: "au", status: "demo", config: cfg };
  const secrets = new MapSecrets({ "demo-clinic/whatsapp": "wa-token", "demo-clinic/twilio": JSON.stringify({ account_sid: "AC1", auth_token: "tok" }) });

  it("sends WhatsApp templates with quick-reply payloads", async () => {
    const { fn, calls } = fakeFetch([{ method: "POST", match: /graph\.facebook\.com\/v26\.0\/PNID\/messages/, body: { messages: [{ id: "wamid.1" }] } }]);
    const ch = new LiveChannels(TEST_ENV, secrets, new WebchatOutbox(), fn);
    const res = await ch.send(client, { channel: "whatsapp", to: "+61411111111", text: "x", template: { name: "staff_escalation_alert", bodyParams: ["a", "b"], quickReplyPayloads: ["claim:1"] } });
    expect(res.providerMessageId).toBe("wamid.1");
    expect(calls[0]!.headers.Authorization).toBe("Bearer wa-token");
    expect(calls[0]!.body).toMatchObject({
      to: "61411111111", type: "template",
      template: { name: "staff_escalation_alert", language: { code: "en_AU" }, components: [
        { type: "body", parameters: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "claim:1" }] },
      ] },
    });
  });

  it("sends SMS through the client's Twilio sub-account", async () => {
    const { fn, calls } = fakeFetch([{ method: "POST", match: /Accounts\/AC1\/Messages\.json/, body: { sid: "SM1" } }]);
    const ch = new LiveChannels(TEST_ENV, secrets, new WebchatOutbox(), fn);
    expect((await ch.send(client, { channel: "sms", to: "+61411111111", text: "hello" })).providerMessageId).toBe("SM1");
    expect(calls[0]!.body).toBe("To=%2B61411111111&From=%2B61400000001&Body=hello");
    expect(calls[0]!.headers.Authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
  });
});
