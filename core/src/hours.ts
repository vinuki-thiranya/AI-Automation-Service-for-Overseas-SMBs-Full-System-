// Business hours, holidays and local-time formatting, always in the client's timezone (DST-safe via Luxon).
import { DateTime, Interval } from "luxon";
import type { ClientConfig, Weekday } from "./config/index.ts";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function weekdayKey(dt: DateTime): Weekday {
  return WEEKDAYS[dt.weekday - 1]!;
}

export function localNow(config: ClientConfig, now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: config.timezone });
}

export function toLocal(config: ClientConfig, iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: false }).setZone(config.timezone);
}

export function isHoliday(config: ClientConfig, dt: DateTime): boolean {
  const day = dt.setZone(config.timezone).toISODate();
  return (config.business.holidays ?? []).some((h) => h.date === day);
}

/** Opening windows for the calendar day containing `day` (local), empty on holidays/closed days. */
export function openingWindows(config: ClientConfig, day: DateTime): Interval[] {
  const local = day.setZone(config.timezone).startOf("day");
  if (isHoliday(config, local)) return [];
  const spans = config.business.hours[weekdayKey(local)] ?? [];
  return spans.map((s) => {
    const [oh, om] = s.open.split(":").map(Number) as [number, number];
    const [ch, cm] = s.close.split(":").map(Number) as [number, number];
    return Interval.fromDateTimes(local.set({ hour: oh, minute: om }), local.set({ hour: ch, minute: cm }));
  }).filter((i) => i.isValid);
}

export function isOpenAt(config: ClientConfig, dt: DateTime): boolean {
  return openingWindows(config, dt).some((w) => w.contains(dt));
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "Mon–Tue 8am–6pm; Wed 8am–7:30pm; Thu 8am–6pm; Fri 8am–4pm; Sat 9am–1pm; Sun closed" */
export function hoursSummary(config: ClientConfig): string {
  const labels: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const describe = (d: Weekday) => {
    const spans = config.business.hours[d] ?? [];
    return spans.length ? spans.map((s) => `${fmtTime(s.open)}–${fmtTime(s.close)}`).join(", ") : "closed";
  };
  const groups: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const d of WEEKDAYS) {
    const text = describe(d);
    const last = groups.at(-1);
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) => `${labels[g.from]}${g.from === g.to ? "" : `–${labels[g.to]}`} ${g.text}`).join("; ");
}

/** "Tue 11 Nov, 10:30am" (+ " with Dr Maya Chen") in the client's timezone. */
export function slotLabel(config: ClientConfig, start: DateTime, practitioner?: string | null): string {
  const local = start.setZone(config.timezone);
  const time = local.toFormat(local.minute === 0 ? "ha" : "h:mma").toLowerCase();
  return `${local.toFormat("ccc d LLL")}, ${time}${practitioner ? ` with ${practitioner}` : ""}`;
}

export function localTimeDescription(config: ClientConfig, now: Date): string {
  return localNow(config, now).toFormat("cccc d LLLL yyyy, h:mma ZZZZ");
}
