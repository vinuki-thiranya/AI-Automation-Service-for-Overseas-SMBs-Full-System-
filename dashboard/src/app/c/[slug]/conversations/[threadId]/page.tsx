import { ArrowLeft, CalendarCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientSettings, getMembership, getThread } from "@/lib/data";
import { CHANNEL_LABEL, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Conversation" };

const REASON: Record<string, string> = {
  customer_request: "The patient asked for a person",
  low_confidence: "The assistant wasn't sure of the answer",
  guardrail: "The message needed a person to check it",
  tool_failure: "A booking or lookup failed",
  llm_outage: "The assistant was unavailable",
};

export default async function Thread({ params }: { params: Promise<{ slug: string; threadId: string }> }) {
  const { slug, threadId } = await params;
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const [data, settings] = await Promise.all([getThread(membership.client_id, threadId), getClientSettings(membership.client_id)]);
  if (!data) notFound();
  const { thread, messages, escalations, bookings } = data;
  const tz = membership.timezone;
  const who = thread.contact?.name ?? thread.contact?.phone ?? "Unknown contact";

  // Escalation markers sit in the timeline where they happened.
  type Item = { at: string; kind: "message"; m: (typeof messages)[number] } | { at: string; kind: "escalation"; e: (typeof escalations)[number] };
  const items: Item[] = [
    ...messages.map((m) => ({ at: m.created_at, kind: "message" as const, m })),
    ...escalations.map((e) => ({ at: e.created_at, kind: "escalation" as const, e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/c/${slug}/conversations`} className="inline-flex h-11 items-center gap-2 font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={18} aria-hidden="true" /> All conversations
      </Link>
      <header className="mt-2 border-b border-rule pb-4">
        <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">{who}</h1>
        <p className="mt-1 text-ink-muted">
          {CHANNEL_LABEL[thread.channel] ?? thread.channel}
          {thread.contact?.phone && thread.contact.name ? `, ${thread.contact.phone}` : ""}. Started {formatDate(thread.created_at, tz, "dayTime")}.
        </p>
        {bookings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <CalendarCheck size={16} className="text-brand" aria-hidden="true" />
                Booked {b.service_id?.replaceAll("-", " ") ?? "appointment"} for {formatDate(b.starts_at, tz, "dayTime")}{b.practitioner ? ` with ${b.practitioner}` : ""}
                <span className="text-ink-muted">({b.status === "booked" ? "upcoming" : b.status.replace("_", "-")})</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      {items.length === 0 ? (
        <p className="mt-8 text-ink-muted">This conversation has no messages left. Messages are removed after 12 months.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {items.map((item) => {
            if (item.kind === "escalation") {
              const e = item.e;
              return (
                <li key={`e-${e.id}`} className="rounded-md border border-signal/40 bg-signal-wash px-4 py-3 text-sm">
                  <p className="font-semibold">Handed to your team: {REASON[e.reason] ?? e.reason}</p>
                  <p className="mt-0.5 text-ink-muted">
                    {e.claimed_by_name ? `${e.claimed_by_name} took it ${e.claimed_at ? formatDate(e.claimed_at, tz, "time") : ""}` : "Not yet claimed by anyone"}
                    {e.resolved_at ? `, resolved ${formatDate(e.resolved_at, tz, "time")}` : ""}.
                  </p>
                </li>
              );
            }
            const m = item.m;
            if (m.author === "system") {
              return <li key={m.id} id={`m-${m.id}`} className="py-1 text-center text-sm text-ink-muted">{m.body}</li>;
            }
            const mine = m.author !== "customer";
            const missedCall = m.metadata?.missed_call !== undefined;
            return (
              <li key={m.id} id={`m-${m.id}`} className={`flex scroll-mt-24 ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-2.5 sm:max-w-[75%] ${mine ? "bg-brand-soft" : "border border-rule bg-surface"} target:ring-2 target:ring-brand`}>
                  <p className="mb-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    {m.author === "staff" && <UserRound size={13} aria-hidden="true" />}
                    <span className="font-semibold">
                      {m.author === "customer" ? who : m.author === "staff" ? "Your team" : settings.assistantName}
                    </span>
                    <span>{formatDate(m.created_at, tz, "time")}</span>
                    {missedCall && <span>, after a missed call</span>}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
