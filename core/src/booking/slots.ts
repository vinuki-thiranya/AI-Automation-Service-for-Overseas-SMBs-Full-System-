// Slot generation (for providers that only expose busy time) and the clinic's booking policy,
// which applies to every adapter: minimum notice, horizon, holidays, opening hours, new-patient cutoff.
import { DateTime, Interval } from "luxon";
import type { ClientConfig, ServiceConfig } from "../config/index.ts";
import { isHoliday, openingWindows } from "../hours.ts";
import type { SlotCandidate } from "./types.ts";

export interface BusyInterval {
  start: DateTime;
  end: DateTime;
}

/**
 * Candidate starts every `stepMinutes` inside open windows, skipping anything that overlaps busy time
 * once the clinic's buffer is added on both sides.
 */
export function generateCandidates(input: {
  windows: Interval[];
  busy: BusyInterval[];
  durationMinutes: number;
  bufferMinutes: number;
  stepMinutes?: number;
  practitionerId: string | null;
  practitioner: string | null;
}): SlotCandidate[] {
  const step = input.stepMinutes ?? 15;
  const out: SlotCandidate[] = [];
  const busy = input.busy.map((b) => Interval.fromDateTimes(
    b.start.minus({ minutes: input.bufferMinutes }), b.end.plus({ minutes: input.bufferMinutes })));
  for (const w of input.windows) {
    let start = w.start!;
    // Align to the step grid (e.g. :00, :15, :30, :45).
    const rem = start.minute % step;
    if (rem) start = start.plus({ minutes: step - rem }).startOf("minute");
    while (start.plus({ minutes: input.durationMinutes }) <= w.end!) {
      const end = start.plus({ minutes: input.durationMinutes });
      const slot = Interval.fromDateTimes(start, end);
      if (!busy.some((b) => b.overlaps(slot))) {
        out.push({ start, end, practitionerId: input.practitionerId, practitioner: input.practitioner });
      }
      start = start.plus({ minutes: step });
    }
  }
  return out;
}

/** Business-hours windows for each local day in [from, to). */
export function businessWindows(config: ClientConfig, from: DateTime, to: DateTime): Interval[] {
  const windows: Interval[] = [];
  for (let day = from.setZone(config.timezone).startOf("day"); day < to; day = day.plus({ days: 1 })) {
    windows.push(...openingWindows(config, day));
  }
  return windows;
}

export type PartOfDay = "morning" | "afternoon" | "evening";

export function applyPolicy(
  config: ClientConfig,
  service: ServiceConfig,
  candidates: SlotCandidate[],
  opts: { now: DateTime; isNewPatient: boolean; partOfDay?: PartOfDay; practitionerName?: string },
): SlotCandidate[] {
  const booking = config.booking;
  const earliest = opts.now.plus({ minutes: booking?.min_notice_minutes ?? 120 });
  const latest = opts.now.plus({ days: booking?.max_days_ahead ?? 60 });
  const cutoff = booking?.new_patient_cutoff;
  const newPatient = opts.isNewPatient || service.id.includes("new-patient");
  const wantName = opts.practitionerName?.toLowerCase();

  return candidates.filter((c) => {
    const local = c.start.setZone(config.timezone);
    if (c.start < earliest || c.start > latest) return false;
    if (isHoliday(config, local)) return false;
    // Must start and finish inside an opening window, even when the provider offered it.
    const windows = openingWindows(config, local);
    if (!windows.some((w) => w.start! <= c.start && c.end <= w.end!)) return false;
    if (newPatient && cutoff && local.toFormat("HH:mm") > cutoff) return false;
    if (opts.partOfDay) {
      const h = local.hour;
      if (opts.partOfDay === "morning" && h >= 12) return false;
      if (opts.partOfDay === "afternoon" && (h < 12 || h >= 17)) return false;
      if (opts.partOfDay === "evening" && h < 17) return false;
    }
    if (wantName && c.practitioner && !c.practitioner.toLowerCase().includes(wantName)) return false;
    return true;
  });
}

/** Chronological, at most `perDay` per day, at most `max` total: gives customers real choice. */
export function pickSpread(candidates: SlotCandidate[], max = 6, perDay = 2): SlotCandidate[] {
  const sorted = [...candidates].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const perDayCount = new Map<string, number>();
  const seen = new Set<string>();
  const out: SlotCandidate[] = [];
  for (const c of sorted) {
    const key = c.start.toISODate()!;
    const startKey = c.start.toMillis().toString();
    if ((perDayCount.get(key) ?? 0) >= perDay || seen.has(startKey)) continue;
    perDayCount.set(key, (perDayCount.get(key) ?? 0) + 1);
    seen.add(startKey);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export function isSameSlot(a: SlotCandidate, b: SlotCandidate): boolean {
  return a.start.toMillis() === b.start.toMillis() && (a.practitionerId ?? "") === (b.practitionerId ?? "");
}
