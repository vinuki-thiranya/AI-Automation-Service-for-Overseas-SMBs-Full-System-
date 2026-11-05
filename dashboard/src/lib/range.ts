// Reporting ranges, computed in the client's timezone so "last 7 days" means the clinic's days.
export type RangeKey = "7d" | "30d" | "90d" | "mtd";
export const RANGES: { key: RangeKey; label: string; short: string }[] = [
  { key: "7d", label: "Last 7 days", short: "7 days" },
  { key: "30d", label: "Last 30 days", short: "30 days" },
  { key: "90d", label: "Last 90 days", short: "90 days" },
  { key: "mtd", label: "This month", short: "Month" },
];

export interface Range {
  key: RangeKey;
  label: string;
  from: string;   // inclusive ISO dates (yyyy-mm-dd)
  to: string;
  prevFrom: string;
  prevTo: string;
  days: number;
}

/** Today's date (yyyy-mm-dd) in a timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function parseRange(value: string | string[] | undefined, timeZone: string, now = new Date()): Range {
  const key: RangeKey = RANGES.some((r) => r.key === value) ? (value as RangeKey) : "30d";
  const to = todayIn(timeZone, now);
  const from = key === "mtd" ? `${to.slice(0, 8)}01` : addDays(to, -(Number.parseInt(key, 10) - 1));
  const days = daysBetween(from, to);
  return { key, label: RANGES.find((r) => r.key === key)!.label, from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), days };
}

/** Every date in [from, to], so charts show empty days instead of skipping them. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
