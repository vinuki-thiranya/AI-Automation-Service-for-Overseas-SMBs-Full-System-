// Reporting (spec §4.8): nightly rollup into metrics_daily (client timezone), the weekly owner report
// and the daily digest. The dashboard (Phase 3) reads metrics_daily.
import { DateTime } from "luxon";
import type { Ctx } from "./context.ts";
import { formatPrice } from "./engine/prompt.ts";
import type { MetricsDailyRow } from "./store/types.ts";

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
}

export function dayBounds(ctx: Ctx, day: string): { from: string; to: string } {
  const start = DateTime.fromISO(day, { zone: ctx.client.config.timezone }).startOf("day");
  return { from: start.toUTC().toISO()!, to: start.plus({ days: 1 }).toUTC().toISO()! };
}

export async function rollupDay(ctx: Ctx, day: string): Promise<MetricsDailyRow> {
  const { from, to } = dayBounds(ctx, day);
  const { store, client } = ctx;
  const messages = await store.listMessagesBetween(client.id, from, to);
  const inbound = messages.filter((m) => m.direction === "inbound" && m.author === "customer");

  // Response time: each customer message → the next assistant/staff message in the same thread.
  const responseSeconds: number[] = [];
  const byThread = new Map<string, typeof messages>();
  for (const m of messages) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m]);
  for (const list of byThread.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    list.forEach((m, i) => {
      if (m.direction !== "inbound") return;
      const next = list.slice(i + 1).find((x) => x.direction === "outbound" && (x.author === "assistant" || x.author === "staff"));
      if (next) responseSeconds.push((new Date(next.created_at).getTime() - new Date(m.created_at).getTime()) / 1000);
    });
  }

  const bookings = await store.listBookingsCreatedBetween(client.id, from, to);
  const leads = await store.listLeadsReceivedBetween(client.id, from, to);
  const escalations = await store.listEscalationsCreatedBetween(client.id, from, to);
  const outbound = messages.filter((m) => m.direction === "outbound");
  const toolUses = (name: string) => outbound.filter((m) => Array.isArray(m.metadata.tools) && (m.metadata.tools as string[]).includes(name)).length;
  const speed = leads.filter((l) => l.first_response_at).map((l) => (new Date(l.first_response_at!).getTime() - new Date(l.received_at).getTime()) / 1000);
  const revenue = client.config.reporting.revenue_per_booking;
  const llmCost = (await store.sumUsageSince(client.id, from)) - (await store.sumUsageSince(client.id, to));

  const row: MetricsDailyRow = {
    client_id: client.id,
    day,
    enquiries: new Set(inbound.map((m) => m.thread_id)).size,
    conversations: new Set(messages.map((m) => m.thread_id)).size,
    bookings: bookings.length,
    cancellations: toolUses("cancel"),
    leads_hot: leads.filter((l) => l.grade === "hot").length,
    leads_warm: leads.filter((l) => l.grade === "warm").length,
    leads_cold: leads.filter((l) => l.grade === "cold").length,
    escalations: escalations.length,
    missed_calls_texted: outbound.filter((m) => m.metadata.missed_call !== undefined).length,
    median_response_seconds: percentile(responseSeconds, 50),
    p95_response_seconds: percentile(responseSeconds, 95),
    speed_to_lead_seconds: percentile(speed, 50),
    revenue_influenced: revenue ? bookings.length * revenue.amount : 0,
    revenue_currency: revenue?.currency ?? null,
    llm_cost_usd: Math.round(llmCost * 10000) / 10000,
    messaging_cost_usd: 0,
  };
  await store.upsertMetricsDaily(row);
  return row;
}

function sum(rows: MetricsDailyRow[], key: keyof MetricsDailyRow): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function fmtSeconds(s: number | null): string {
  if (s === null) return "–";
  return s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)} min`;
}

export interface ReportContent {
  subject: string;
  text: string;
  html: string;
}

export function buildReport(ctx: Ctx, rows: MetricsDailyRow[], label: string): ReportContent {
  const cfg = ctx.client.config;
  const revenue = sum(rows, "revenue_influenced");
  const currency = rows.find((r) => r.revenue_currency)?.revenue_currency ?? cfg.reporting.revenue_per_booking?.currency ?? "AUD";
  const median = percentile(rows.map((r) => r.median_response_seconds).filter((v): v is number => v !== null), 50);
  const lines: [string, string][] = [
    ["Enquiries handled", String(sum(rows, "enquiries"))],
    ["Bookings made", String(sum(rows, "bookings"))],
    ["Leads (hot / warm / cold)", `${sum(rows, "leads_hot")} / ${sum(rows, "leads_warm")} / ${sum(rows, "leads_cold")}`],
    ["Typical response time", fmtSeconds(median)],
    ["Missed calls texted back", String(sum(rows, "missed_calls_texted"))],
    ["Handed to the team", String(sum(rows, "escalations"))],
    ["Estimated revenue influenced", formatPrice({ amount: revenue, currency }) ?? "–"],
  ];
  const subject = `${cfg.name}: your front desk ${label}`;
  const text = `${subject}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nRevenue influenced = bookings made by the assistant × your average booking value.\n`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2933;max-width:560px;margin:auto">
<h2 style="font-weight:600">${subject}</h2>
<table style="width:100%;border-collapse:collapse">${lines.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${k}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${v}</td></tr>`).join("")}</table>
<p style="color:#6b7280;font-size:13px">Revenue influenced = bookings made by the assistant × your average booking value.</p>
</body></html>`;
  return { subject, text, html };
}

export async function sendOwnerReport(ctx: Ctx, kind: "weekly" | "daily", endDay: string): Promise<boolean> {
  const cfg = ctx.client.config;
  if (!cfg.channels.email?.enabled) {
    await ctx.store.audit(ctx.client.id, "core:reports", "report_skipped", { kind, reason: "email channel disabled" });
    return false;
  }
  const end = DateTime.fromISO(endDay, { zone: cfg.timezone });
  const fromDay = kind === "weekly" ? end.minus({ days: 6 }).toISODate()! : endDay;
  const rows = await ctx.store.listMetrics(ctx.client.id, fromDay, endDay);
  const label = kind === "weekly" ? `week to ${end.toFormat("d LLL")}` : `on ${end.toFormat("ccc d LLL")}`;
  const report = buildReport(ctx, rows, label);
  for (const to of cfg.reporting.owner_emails) {
    await ctx.deps.channels.send(ctx.client, { channel: "email", to, subject: report.subject, text: report.text, html: report.html });
  }
  return true;
}
