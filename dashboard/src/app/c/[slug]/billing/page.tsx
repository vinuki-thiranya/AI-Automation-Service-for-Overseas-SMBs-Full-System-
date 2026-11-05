import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackStep } from "@/components/onboarding";
import { getMembership, listInvoices } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Billing" };

const KIND: Record<string, string> = { deposit: "Setup deposit", go_live: "Go-live balance", care_plan: "Care plan", usage: "Usage", extra_hours: "Extra hours" };
const STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "text-brand" },
  sent: { label: "Due", className: "text-signal" },
  draft: { label: "Draft (only the agency sees this)", className: "text-ink-muted" },
  void: { label: "Cancelled", className: "text-ink-muted line-through" },
};

export default async function Billing({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const membership = await getMembership(slug);
  if (!membership || membership.role === "staff") notFound();
  const tz = membership.timezone;
  const invoices = await listInvoices(membership.client_id);
  const due = invoices.filter((i) => i.status === "sent");
  const dueTotal = due.reduce((n, i) => n + i.amount, 0);
  const currency = invoices[0]?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-4xl">
      <TrackStep slug={slug} step="billing" />
      <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">Billing</h1>
      <p className="mt-1 max-w-2xl text-ink-muted">
        Invoices for your setup, care plan and usage. Usage is passed through at cost plus 20%, and you can ask for the raw provider invoices any time.
      </p>

      {invoices.length === 0 ? (
        <div className="mt-10 max-w-lg">
          <p className="text-lg font-bold">No invoices yet.</p>
          <p className="mt-2 text-ink-muted">Your first invoice is the setup deposit, sent when the project starts.</p>
        </div>
      ) : (
        <>
          <p className="font-display mt-8 text-xl font-bold tracking-[-0.01em]">
            {due.length === 0 ? "Nothing to pay right now." : `${formatMoney(dueTotal, currency, { cents: true })} due on ${due.length} ${due.length === 1 ? "invoice" : "invoices"}.`}
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-rule text-sm text-ink-muted">
                  <th className="py-2 pr-4 font-semibold">Invoice</th>
                  <th className="py-2 pr-4 font-semibold">For</th>
                  <th className="py-2 pr-4 font-semibold">Issued</th>
                  <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold"><span className="sr-only">Link</span></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-rule align-top last:border-0">
                    <td className="py-3 pr-4 font-semibold">{inv.number}</td>
                    <td className="py-3 pr-4">
                      <span className="block">{KIND[inv.kind] ?? inv.kind}</span>
                      {inv.description && <span className="block text-sm text-ink-muted">{inv.description}</span>}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatDate(inv.issued_on, tz)}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">{formatMoney(inv.amount, inv.currency, { cents: true })}</td>
                    <td className={`py-3 pr-4 text-sm font-semibold ${STATUS[inv.status]?.className ?? ""}`}>
                      {STATUS[inv.status]?.label ?? inv.status}
                      {inv.status === "paid" && inv.paid_on && <span className="block font-normal text-ink-muted">on {formatDate(inv.paid_on, tz, "short")}</span>}
                      {inv.status === "sent" && inv.due_on && <span className="block font-normal text-ink-muted">by {formatDate(inv.due_on, tz, "short")}</span>}
                    </td>
                    <td className="py-3">
                      {inv.url && (
                        <a href={inv.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-brand hover:bg-brand-soft/60">
                          View<span className="sr-only"> invoice {inv.number} (opens {inv.provider ?? "provider"} in a new tab)</span>
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
