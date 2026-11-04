import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMembership, listThreads, searchMessages } from "@/lib/data";
import { CHANNEL_LABEL, formatDate, splitHighlights } from "@/lib/format";

export const metadata: Metadata = { title: "Conversations" };

const STATUS: Record<string, { label: string; className: string }> = {
  ai: { label: "Assistant", className: "bg-gumleaf text-ink" },
  human: { label: "Staff took over", className: "bg-signal-wash text-signal" },
  closed: { label: "Closed", className: "text-ink-muted" },
};
const AUTHOR: Record<string, string> = { customer: "Patient", assistant: "Assistant", staff: "Staff", system: "System" };

export default async function Conversations({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; channel?: string; status?: string; before?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const tz = membership.timezone;
  const q = sp.q?.trim() ?? "";
  const channel = sp.channel && CHANNEL_LABEL[sp.channel] ? sp.channel : undefined;
  const status = sp.status && STATUS[sp.status] ? sp.status : undefined;
  const base = `/c/${slug}/conversations`;
  const hits = q ? await searchMessages(membership.client_id, q, sp.before) : null;
  const threads = q ? [] : await listThreads(membership.client_id, { channel, status, before: sp.before });
  const filtered = hits && channel ? hits.filter((h) => h.channel === channel) : hits;
  const page = (filtered ?? threads) as { created_at?: string; last_message_at?: string }[];
  const last = page.at(-1);
  const nextBefore = page.length >= (q ? 50 : 40) ? (last?.created_at ?? last?.last_message_at) : undefined;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || undefined, channel, status, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-[-0.01em]">Conversations</h1>
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
        <button className="h-11 cursor-pointer rounded-md bg-eucalyptus px-4 font-semibold text-on-eucalyptus">{q ? "Search" : "Apply"}</button>
        {(q || channel || status) && <Link href={base} className="flex h-11 items-center px-2 font-semibold text-ink-muted hover:text-ink">Clear</Link>}
      </form>

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
                  <Link href={`${base}/${h.thread_id}#m-${h.message_id}`} className="block px-1 py-4 hover:bg-gumleaf/40 sm:px-3">
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
              <Link href={`${base}/${t.id}`} className="flex gap-4 px-1 py-4 hover:bg-gumleaf/40 sm:px-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{t.contact?.name ?? t.contact?.phone ?? "Unknown contact"}</span>
                    <span className="text-sm text-ink-muted">{CHANNEL_LABEL[t.channel] ?? t.channel}</span>
                    {t.openEscalation && <span className="rounded-full bg-signal-wash px-2 py-0.5 text-xs font-bold text-signal">Waiting for staff</span>}
                  </p>
                  {t.preview && (
                    <p className="mt-1 truncate text-ink-muted">
                      <span className="text-ink">{AUTHOR[t.previewAuthor ?? ""] ?? ""}:</span> {t.preview}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm text-ink-muted">{formatDate(t.last_message_at, tz, "dayTime")}</p>
                  <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[t.status]?.className ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextBefore && (
        <div className="mt-6">
          <Link href={keep({ before: nextBefore })} className="inline-flex h-11 items-center rounded-md border border-rule px-4 font-semibold hover:bg-gumleaf/40">Show older</Link>
        </div>
      )}
    </div>
  );
}
