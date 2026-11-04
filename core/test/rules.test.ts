import { DateTime, Interval } from "luxon";
import { describe, expect, it } from "vitest";
import { applyPolicy, businessWindows, generateCandidates, pickSpread } from "../src/booking/slots.ts";
import { inWhatsAppWindow, isStartMessage, isStopMessage } from "../src/compliance.ts";
import { unknownPrices } from "../src/engine/conversation.ts";
import { hoursSummary, isOpenAt, slotLabel } from "../src/hours.ts";
import { gradeFor, ruleScore } from "../src/leads.ts";
import { createHarness } from "../src/testing.ts";
import type { ThreadRow } from "../src/store/types.ts";
import { demoConfig, TUESDAY_11AM_SYDNEY } from "./fixtures.ts";

const cfg = demoConfig();
const tz = cfg.timezone;

describe("STOP / START", () => {
  it("matches the whole message only", () => {
    expect(isStopMessage(cfg, "STOP")).toBe(true);
    expect(isStopMessage(cfg, "  stop. ")).toBe(true);
    expect(isStopMessage(cfg, "cancel")).toBe(true);
    expect(isStopMessage(cfg, "cancel my appointment")).toBe(false);
    expect(isStopMessage(cfg, "please stop sending reminders about my booking")).toBe(false);
    expect(isStartMessage("start")).toBe(true);
  });
});

describe("WhatsApp 24h window", () => {
  const thread = { last_inbound_at: "2026-11-09T01:00:00Z" } as ThreadRow;
  it("is open within 24h of the last customer message", () => {
    expect(inWhatsAppWindow(thread, new Date("2026-11-10T00:59:00Z"))).toBe(true);
    expect(inWhatsAppWindow(thread, new Date("2026-11-10T01:01:00Z"))).toBe(false);
    expect(inWhatsAppWindow({ last_inbound_at: null } as ThreadRow, new Date())).toBe(false);
  });
});

describe("hours", () => {
  it("summarises and groups days", () => {
    expect(hoursSummary(cfg)).toBe("Mon–Tue 8am–6pm; Wed 8am–7:30pm; Thu 8am–6pm; Fri 8am–4pm; Sat 9am–1pm; Sun closed");
  });
  it("knows open/closed and holidays in the client timezone", () => {
    expect(isOpenAt(cfg, DateTime.fromJSDate(TUESDAY_11AM_SYDNEY, { zone: tz }))).toBe(true);
    expect(isOpenAt(cfg, DateTime.fromISO("2026-11-10T19:00", { zone: tz }))).toBe(false);
    expect(isOpenAt(cfg, DateTime.fromISO("2026-12-25T10:00", { zone: tz }))).toBe(false);   // Christmas (holiday) is a Friday
  });
  it("labels slots in local time", () => {
    expect(slotLabel(cfg, DateTime.fromISO("2026-11-10T02:30:00Z"), "Dr Sam Patel")).toBe("Tue 10 Nov, 1:30pm with Dr Sam Patel");
  });
  it("keeps 8am local across the daylight-saving change (Sydney, 4 Oct 2026)", () => {
    const before = businessWindows(cfg, DateTime.fromISO("2026-10-02", { zone: tz }), DateTime.fromISO("2026-10-03", { zone: tz }))[0]!;
    const after = businessWindows(cfg, DateTime.fromISO("2026-10-05", { zone: tz }), DateTime.fromISO("2026-10-06", { zone: tz }))[0]!;
    expect(before.start!.toFormat("HH:mm ZZ")).toBe("08:00 +10:00");
    expect(after.start!.toFormat("HH:mm ZZ")).toBe("08:00 +11:00");
  });
});

describe("slot generation and policy", () => {
  const day = DateTime.fromISO("2026-11-11", { zone: tz });   // Wednesday 8am–7:30pm
  const windows = [Interval.fromDateTimes(day.set({ hour: 8 }), day.set({ hour: 10 }))];
  const service = cfg.business.services.find((s) => s.id === "check-up-clean")!;   // 45 min

  it("skips times that overlap busy time plus the buffer", () => {
    const busy = [{ start: day.set({ hour: 9 }), end: day.set({ hour: 9, minute: 30 }) }];
    const starts = generateCandidates({ windows, busy, durationMinutes: 45, bufferMinutes: 15, practitionerId: "a", practitioner: null })
      .map((c) => c.start.toFormat("HH:mm"));
    // 8:00 ends 8:45 (clear of 8:45–9:45 busy+buffer); 8:15 would end 9:00 (overlaps); after: 9:45 ends 10:30 > window end.
    expect(starts).toEqual(["08:00"]);
  });

  it("enforces notice, new-patient cutoff and part of day", () => {
    const now = DateTime.fromJSDate(TUESDAY_11AM_SYDNEY, { zone: tz });
    const all = generateCandidates({
      windows: businessWindows(cfg, now, now.plus({ days: 2 })), busy: [], durationMinutes: 45, bufferMinutes: 0, practitionerId: "a", practitioner: null,
    });
    const allowed = applyPolicy(cfg, service, all, { now, isNewPatient: true });
    expect(allowed[0]!.start.setZone(tz).toFormat("ccc HH:mm")).toBe("Tue 13:00");          // 2h minimum notice
    expect(allowed.every((c) => c.start.setZone(tz).toFormat("HH:mm") <= "16:00")).toBe(true);   // new-patient cutoff
    const evening = applyPolicy(cfg, service, all, { now, isNewPatient: false, partOfDay: "evening" });
    expect(evening.every((c) => c.start.setZone(tz).hour >= 17)).toBe(true);
    expect(evening.length).toBeGreaterThan(0);
  });

  it("spreads offers across days", () => {
    const now = DateTime.fromJSDate(TUESDAY_11AM_SYDNEY, { zone: tz });
    const all = generateCandidates({ windows: businessWindows(cfg, now, now.plus({ days: 5 })), busy: [], durationMinutes: 30, bufferMinutes: 0, practitionerId: "a", practitioner: null });
    const picked = pickSpread(applyPolicy(cfg, service, all, { now, isNewPatient: false }), 6, 2);
    const perDay = new Map<string, number>();
    for (const p of picked) perDay.set(p.start.toISODate()!, (perDay.get(p.start.toISODate()!) ?? 0) + 1);
    expect(picked).toHaveLength(6);
    expect(Math.max(...perDay.values())).toBe(2);
  });
});

describe("lead scoring", () => {
  const lq = cfg.lead_qualification!;
  it("weights choice answers to 0–10", () => {
    // max = 10×2 + 10×2 + 8×1 = 48
    expect(ruleScore(lq, { treatment: "Invisalign", timeline: "This month", "health-fund": "Yes" })).toBe(10);
    expect(ruleScore(lq, { treatment: "Whitening", timeline: "In 1-3 months", "health-fund": "No" })).toBe(5.8);    // 28/48
    expect(ruleScore(lq, { treatment: "Just browsing", timeline: "Not sure yet", "health-fund": "No" })).toBe(1.7);  // 8/48
    expect(ruleScore(lq, {})).toBe(0);
  });
  it("grades with the client thresholds", () => {
    expect(gradeFor(lq, 9)).toBe("hot");
    expect(gradeFor(lq, 5)).toBe("warm");
    expect(gradeFor(lq, 1)).toBe("cold");
  });
});

describe("price guard", () => {
  const h = createHarness(cfg);
  it("allows listed prices and policy amounts, flags invented ones", () => {
    expect(unknownPrices(h.ctx, "A check-up and clean is $220.", [])).toEqual([]);
    expect(unknownPrices(h.ctx, "Late cancellations may incur a $50 fee.", [])).toEqual([]);
    expect(unknownPrices(h.ctx, "Invisalign is usually $6,500.", [])).toEqual(["6500"]);
    expect(unknownPrices(h.ctx, "Whitening is AUD 400", [])).toEqual(["400"]);
  });
});
