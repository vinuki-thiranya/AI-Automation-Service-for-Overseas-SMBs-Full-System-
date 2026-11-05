import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackStep } from "@/components/onboarding";
import { getMembership, listThreads, searchMessages, threadsInHour } from "@/lib/data";
import { CHANNEL_LABEL, formatDate, splitHighlights } from "@/lib/format";

export const metadata: Metadata = { title: "Conversations" };

const STATUS: Record<string, { label: string; className: string }> = {
  ai: { label: "Assistant", className: "bg-brand-soft text-ink" },
  human: { label: "Staff took over", className: "bg-signal-wash text-signal" },
  closed: { label: "Closed", className: "text-ink-muted" },
};
const AUTHOR: Record<string, string> = { customer: "Patient", assistant: "Assistant", staff: "Staff", system: "System" };

const WEEKDAY = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const clock = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);
function cellLabel(cell: { day: number; hour?: number }) {
  const day = WEEKDAY[cell.day - 1];
  return cell.hour === undefined ? day : `${day}, ${clock(cell.hour)} to ${clock((cell.hour + 1) % 24)}`;
}

export default async function Conversations({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; channel?: string; status?: string; before?: string; day?: string; hour?: string; from?: string; to?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const tz = membership.timezone;
  const q = sp.q?.trim() ?? "";
  const channel = sp.channel && CHANNEL_LABEL[sp.channel] ? sp.channel : undefined;
  const status = sp.status && STATUS[sp.status] ? sp.status : undefined;
  const base = `/c/${slug}/conversations`;
  // From a heatmap cell: ?day=1..7 (Mon..Sun) [&hour=0..23] &from&to (local dates).
  const day = /^[1-7]$/.test(sp.day ?? "") ? Number(sp.day) : undefined;
  const hour = day && /^([01]?\d|2[0-3])$/.test(sp.hour ?? "") ? Number(sp.hour) : undefined;
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const cell = day && !q ? { day, hour, from: isDate(sp.from) ?? "2000-01-01", to: isDate(sp.to) ?? "2100-01-01" } : undefined;
  const hits = q ? await searchMessages(membership.client_id, q, sp.before) : null;
  const ids = cell ? await threadsInHour(membership.client_id, cell.from, cell.to, cell.day, cell.hour, sp.before) : undefined;
  const threads = q ? [] : await listThreads(membership.client_id, { channel, status, before: cell ? undefined : sp.before, ids });
  const filtered = hits && channel ? hits.filter((h) => h.channel === channel) : hits;
  const page = (filtered ?? threads) as { created_at?: string; last_message_at?: string }[];
  const last = page.at(-1);
  const nextBefore = page.length >= (q ? 50 : 40) ? (last?.created_at ?? last?.last_message_at) : undefined;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const fromCell = cell ? { day: String(cell.day), hour: cell.hour?.toString(), from: isDate(sp.from), to: isDate(sp.to) } : {};
    for (const [k, v] of Object.entries({ q: q || undefined, channel, status, ...fromCell, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">Conversations</h1>
      <p className="mt-1 text-ink-muted">Every message with your patients, searchable for 12 months.</p>

      <form action={base} className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="block text-sm font-semibold">Search messages</label>
          <div className="relative mt-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input id="q" name="q" type="search" defaultValue={q} placeholder="e.g. invisalign, parking, refund"
              className="h-11 w-full rounded-md border border-rule bg-surface pr-3 pl-10 text-ink placeholder:text-ink-muted" />
          </div>
        </div>
        <div>
          <label htmlFor="channel" className="block text-sm font-semibold">Channel</label>
          <select id="channel" name="channel" defaultValue={channel ?? ""} className="mt-1 h-11 rounded-md border border-rule bg-surface px-3">
            <option value="">All channels</option>
            {["whatsapp", "sms", "webchat", "email"].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </div>
        {!q && (
          <div>
            <label htmlFor="status" className="block text-sm font-semibold">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""} className="mt-1 h-11 rounded-md border border-rule bg-surface px-3">
              <option value="">Any status</option>
              <option value="human">Staff took over</option>
              <option value="ai">Assistant</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}
        <button className="h-11 cursor-pointer rounded-md bg-brand px-4 font-semibold text-on-brand">{q ? "Search" : "Apply"}</button>
        {(q || channel || status) && <Link href={base} className="flex h-11 items-center px-2 font-semibold text-ink-muted hover:text-ink">Clear</Link>}
      </form>

      {q && <TrackStep slug={slug} step="search" />}
      {cell && (
        <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-brand-soft px-4 py-3">
          <span>Showing enquiries on <strong>{cellLabel(cell)}</strong>{sp.from && sp.to ? <>, {formatDate(`${cell.from}T12:00:00Z`, tz, "day")} to {formatDate(`${cell.to}T12:00:00Z`, tz, "day")}</> : null}.</span>
          <Link href={base} className="font-semibold text-brand underline-offset-4 hover:underline">Show all conversations</Link>
        </p>
      )}

      {hits ? (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-sm text-ink-muted">{filtered!.length === 0 ? "No results" : `${filtered!.length}${nextBefore ? "+" : ""} messages matching “${q}”`}</h2>
          {filtered!.length === 0 ? (
            <div className="mt-4 max-w-lg">
              <p className="text-lg font-bold">No messages match “{q}”.</p>
              <p className="mt-2 text-ink-muted">Search matches whole words in the last 12 months. Try a shorter word, a different spelling, or clear the channel filter.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {filtered!.map((h) => (
                <li key={h.message_id}>
                  <Link href={`${base}/${h.thread_id}#m-${h.message_id}`} className="block px-1 py-4 hover:bg-brand-soft/40 sm:px-3">
                    <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-muted">
                      <span className="font-semibold text-ink">{h.contact_name ?? "Unknown contact"}</span>
                      <span>{AUTHOR[h.author]} on {CHANNEL_LABEL[h.channel] ?? h.channel}</span>
                      <span className="ml-auto">{formatDate(h.created_at, tz, "dayTime")}</span>
                    </p>
                    <p className="mt-1 line-clamp-2">
                      {splitHighlights(h.snippet).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : threads.length === 0 ? (
        <div className="mt-10 max-w-lg">
          <p className="text-lg font-bold">{channel || status ? "No conversations match these filters." : "No conversations yet."}</p>
          <p className="mt-2 text-ink-muted">
            {channel || status ? "Clear the filters to see everything." : "When a patient messages your clinic, the conversation shows up here within seconds."}
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`${base}/${t.id}`} className="block px-1 py-4 hover:bg-brand-soft/40 sm:px-3">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{t.contact?.name ?? t.contact?.phone ?? "Unknown contact"}</span>
                  <span className="text-sm text-ink-muted">{CHANNEL_LABEL[t.channel] ?? t.channel}</span>
                  {t.openEscalation && <span className="rounded-full bg-signal-wash px-2 py-0.5 text-xs font-bold text-signal">Waiting for staff</span>}
                  <span className="tabular ml-auto text-sm text-ink-muted">{formatDate(t.last_message_at, tz, "dayTime")}</span>
                </p>
                <div className="mt-1 flex items-start gap-3">
                  {t.preview && (
                    <p className="line-clamp-2 min-w-0 flex-1 text-ink-muted sm:line-clamp-1">
                      <span className="text-ink">{AUTHOR[t.previewAuthor ?? ""] ?? ""}:</span> {t.preview}
                    </p>
                  )}
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[t.status]?.className ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextBefore && (
        <div className="mt-6">
          <Link href={keep({ before: nextBefore })} className="inline-flex h-11 items-center rounded-md border border-rule px-4 font-semibold hover:bg-brand-soft/40">Show older</Link>
        </div>
      )}
    </div>
  );
}
