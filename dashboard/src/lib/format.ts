const nf = new Intl.NumberFormat("en-AU");

export const formatCount = (n: number) => nf.format(Math.round(n));

export function formatMoney(amount: number, currency: string, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency, currencyDisplay: currency === "AUD" ? "narrowSymbol" : "code",
    minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(amount);
}

/** 9 → "9 s", 75 → "1 min 15 s", 4000 → "1 h 7 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "–";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  const h = Math.floor(seconds / 3600);
  return `${h} h ${Math.round((seconds % 3600) / 60)} min`;
}

/** Change against the previous period: "+12%", "−8%", or null when there's nothing to compare. */
export function formatDelta(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } | null {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "no change", direction: "flat" };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, direction: pct > 0 ? "up" : "down" };
}

export function formatDate(iso: string, timeZone: string, style: "day" | "dayTime" | "time" | "short" = "day"): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "time" ? { hour: "numeric", minute: "2-digit" }
    : style === "dayTime" ? { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
    : style === "short" ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", sms: "SMS", webchat: "Web chat", email: "Email", voice: "Phone", messenger: "Messenger", instagram: "Instagram",
};

/** Splits a search snippet into plain and highlighted parts (markers U+0002 … U+0003 from search_messages). */
export function splitHighlights(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  for (const chunk of snippet.split("\u0002")) {
    const [hit, rest] = chunk.includes("\u0003") ? chunk.split("\u0003", 2) as [string, string] : [null, chunk];
    if (hit !== null && hit !== "") parts.push({ text: hit, hit: true });
    if (rest) parts.push({ text: rest, hit: false });
  }
  return parts;
}
