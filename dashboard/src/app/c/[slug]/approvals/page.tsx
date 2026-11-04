import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMembership, listDrafts } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { DraftCard } from "./draft-card";

export const metadata: Metadata = { title: "Approvals" };

const HELPDESK: Record<string, string> = { freshdesk: "Freshdesk", zendesk: "Zendesk", gorgias: "Gorgias", other: "your help desk" };
const OUTCOME: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "text-eucalyptus" },
  sent: { label: "Sent", className: "text-eucalyptus" },
  rejected: { label: "Rejected", className: "text-ink-muted" },
  failed: { label: "Couldn't send", className: "text-danger" },
};

export default async function Approvals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const membership = await getMembership(slug);
  if (!membership || !membership.packages.includes("D")) notFound();
  const tz = membership.timezone;
  const [pending, decided] = await Promise.all([listDrafts(membership.client_id, "pending"), listDrafts(membership.client_id, "decided")]);
  const desk = HELPDESK[pending[0]?.helpdesk ?? decided[0]?.helpdesk ?? "other"];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-[-0.01em]">Approvals</h1>
      <p className="mt-1 max-w-2xl text-ink-muted">
        Replies drafted for support emails in {desk}. Nothing is sent until someone approves it. Oldest first.
      </p>

      {pending.length === 0 ? (
        <div className="mt-10 max-w-lg">
          <p className="text-lg font-bold">Nothing waiting for approval.</p>
          <p className="mt-2 text-ink-muted">New drafts from {desk} appear here as tickets come in. You&apos;ll see a count next to Approvals in the menu.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm font-semibold text-signal">{pending.length} {pending.length === 1 ? "draft needs" : "drafts need"} a decision</p>
          {pending.map((d) => <DraftCard key={d.id} slug={slug} draft={d} received={formatDate(d.created_at, tz, "dayTime")} />)}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-12">
          <h2 className="font-bold">Recently decided</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {decided.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 py-3 sm:px-3">
                <span className="font-semibold">{d.subject ?? "No subject"}</span>
                <span className="text-sm text-ink-muted">{d.customer_name}, {d.external_ticket_id}</span>
                <span className={`ml-auto text-sm font-semibold ${OUTCOME[d.status]?.className ?? ""}`}>{OUTCOME[d.status]?.label ?? d.status}</span>
                <span className="tabular w-full text-sm text-ink-muted sm:w-auto">{d.decided_at ? formatDate(d.decided_at, tz, "dayTime") : ""}{d.decision_note ? `: ${d.decision_note}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
