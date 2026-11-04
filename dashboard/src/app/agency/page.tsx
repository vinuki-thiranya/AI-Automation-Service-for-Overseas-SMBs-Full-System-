import type { Metadata } from "next";
import Link from "next/link";
import { agencyHealth } from "@/lib/data";
import { formatCount, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "All clients" };

const STATUS: Record<string, string> = { demo: "Demo", staging: "Staging", uat: "Testing", live: "Live", paused: "Paused", offboarded: "Offboarded" };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export default async function Agency() {
  // Rendered per request; "now" is the request time.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await agencyHealth(since);
  const totalSpend = rows.reduce((n, r) => n + r.spend_usd, 0);
  const needs = rows.filter((r) => r.issues > 0 || r.open_escalations > 0);
  const statusUrl = process.env.NEXT_PUBLIC_STATUS_URL;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-[-0.01em]">All clients</h1>
      <p className="mt-1 text-ink-muted">
        Last 30 days. {statusUrl ? <a href={statusUrl} className="font-semibold text-eucalyptus underline-offset-4 hover:underline">Uptime status</a> : "Uptime is tracked in Uptime Kuma (status page once deployed)."}
      </p>

      <p className="mt-8 text-xl font-bold tracking-[-0.01em]">
        {rows.length} {rows.length === 1 ? "client" : "clients"}, {formatMoney(totalSpend, "USD", { cents: true })} in API spend.{" "}
        <span className={needs.length ? "text-signal" : "text-ink-muted"}>
          {needs.length ? `${needs.length} need${needs.length === 1 ? "s" : ""} a look.` : "Nothing needs attention."}
        </span>
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-ink-muted">No clients yet. Provision one with <code>node scripts/new-client.ts</code>, or load the demo data with <code>node scripts/seed-demo.ts</code>.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="tabular w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-rule text-sm text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Client</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 text-right font-semibold">Messages</th>
                <th className="py-2 pr-4 text-right font-semibold">From patients</th>
                <th className="py-2 pr-4 text-right font-semibold">API spend</th>
                <th className="py-2 pr-4 text-right font-semibold">Open hand-offs</th>
                <th className="py-2 pr-4 text-right font-semibold">Issues</th>
                <th className="py-2 font-semibold">Last message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client_id} className="border-b border-rule last:border-0">
                  <td className="py-3 pr-4"><Link href={`/c/${r.slug}`} className="font-semibold text-eucalyptus underline-offset-4 hover:underline">{r.name}</Link></td>
                  <td className="py-3 pr-4 text-sm">{STATUS[r.status] ?? r.status}</td>
                  <td className="py-3 pr-4 text-right">{formatCount(r.messages)}</td>
                  <td className="py-3 pr-4 text-right">{formatCount(r.inbound)}</td>
                  <td className="py-3 pr-4 text-right">{formatMoney(r.spend_usd, "USD", { cents: true })}</td>
                  <td className={`py-3 pr-4 text-right ${r.open_escalations ? "font-bold text-signal" : ""}`}>{r.open_escalations}</td>
                  <td className={`py-3 pr-4 text-right ${r.issues ? "font-bold text-signal" : ""}`}>{r.issues}</td>
                  <td className="py-3 text-sm text-ink-muted">{ago(r.last_message_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-ink-muted">Issues: blocked prompt injections, invented prices caught, failed deliveries and text-backs, failed lead scoring, and hand-offs caused by tool or model outages.</p>
        </div>
      )}
    </div>
  );
}
