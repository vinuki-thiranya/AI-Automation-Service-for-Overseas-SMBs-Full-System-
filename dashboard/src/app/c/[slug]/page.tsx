import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BookingsChart, EnquiriesChart, LeadsChart, ReplyTimeChart } from "@/components/charts";
import { Heatmap } from "@/components/heatmap";
import { KpiRow, type Kpi } from "@/components/kpi-row";
import { RangePicker } from "@/components/range-picker";
import { getClientSettings, getEnquiriesByDay, getEnquiryHours, getMembership, getMetrics, type MetricsRow } from "@/lib/data";
import { formatCount, formatDelta, formatDuration, formatMoney } from "@/lib/format";
import { eachDay, parseRange } from "@/lib/range";

export const metadata: Metadata = { title: "Overview" };

const sum = (rows: MetricsRow[], key: keyof MetricsRow) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
/** Enquiry-weighted average of the daily medians: a fair "typical reply time" across days. */
function typicalReply(rows: MetricsRow[]): number | null {
  const withData = rows.filter((r) => r.median_response_seconds !== null && r.enquiries > 0);
  const weight = withData.reduce((n, r) => n + r.enquiries, 0);
  return weight ? withData.reduce((n, r) => n + r.median_response_seconds! * r.enquiries, 0) / weight : null;
}

function Panel({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-rule bg-surface p-4 sm:p-5 ${className}`}>
      <h2 className="font-bold">{title}</h2>
      {description && <p className="mt-0.5 mb-3 text-sm text-ink-muted">{description}</p>}
      {children}
    </section>
  );
}

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ slug }, { range: rangeParam }] = await Promise.all([params, searchParams]);
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const range = parseRange(rangeParam, membership.timezone);
  const id = membership.client_id;
  const [rows, prevRows, byDay, hours, settings] = await Promise.all([
    getMetrics(id, range.from, range.to),
    getMetrics(id, range.prevFrom, range.prevTo),
    getEnquiriesByDay(id, range.from, range.to),
    getEnquiryHours(id, range.from, range.to),
    getClientSettings(id),
  ]);

  const money = membership.role !== "staff";
  const hasLeads = membership.packages.includes("B");
  const enquiries = sum(rows, "enquiries");
  const bookings = sum(rows, "bookings");
  const afterHours = byDay.reduce((n, d) => n + Number(d.after_hours), 0);
  const afterShare = enquiries ? Math.round((afterHours / Math.max(enquiries, 1)) * 100) : 0;
  const reply = typicalReply(rows);
  const prevReply = typicalReply(prevRows);
  const revenue = sum(rows, "revenue_influenced");
  const currency = rows.find((r) => r.revenue_currency)?.revenue_currency ?? settings.revenuePerBooking?.currency ?? "AUD";
  const delta = (cur: number, prev: number, higherIsGood = true) => {
    const d = formatDelta(cur, prev);
    return d ? { ...d, good: d.direction === "flat" || (d.direction === "up") === higherIsGood } : null;
  };

  const kpis: Kpi[] = [
    { label: "Enquiries handled", value: enquiries, display: formatCount(enquiries), format: "count", delta: delta(enquiries, sum(prevRows, "enquiries")) },
    { label: "Bookings made", value: bookings, display: formatCount(bookings), format: "count", delta: delta(bookings, sum(prevRows, "bookings")) },
    hasLeads
      ? { label: "Hot leads", value: sum(rows, "leads_hot"), display: formatCount(sum(rows, "leads_hot")), format: "count", note: `Plus ${sum(rows, "leads_warm")} warm and ${sum(rows, "leads_cold")} cold` }
      : { label: "Missed calls texted back", value: sum(rows, "missed_calls_texted"), display: formatCount(sum(rows, "missed_calls_texted")), format: "count", delta: delta(sum(rows, "missed_calls_texted"), sum(prevRows, "missed_calls_texted")) },
    { label: "Typical reply time", value: null, format: "text", display: formatDuration(reply), delta: reply !== null && prevReply ? delta(reply, prevReply, false) : null },
    { label: "Handed to your team", value: sum(rows, "escalations"), display: formatCount(sum(rows, "escalations")), format: "count", note: "Conversations a person took over" },
  ];
  if (money) {
    kpis.push({
      label: "Estimated revenue from bookings", value: null, format: "text", display: formatMoney(revenue, currency), delta: delta(revenue, sum(prevRows, "revenue_influenced")),
      note: settings.revenuePerBooking ? `Bookings × ${formatMoney(settings.revenuePerBooking.amount, settings.revenuePerBooking.currency)}` : undefined,
    });
  }

  const after = new Map(byDay.map((d) => [d.day, Number(d.after_hours)]));
  const metricsByDay = new Map(rows.map((r) => [r.day, r]));
  const days = eachDay(range.from, range.to);
  const daily = days.map((day) => {
    const r = metricsByDay.get(day);
    const total = r?.enquiries ?? 0;
    const a = Math.min(after.get(day) ?? 0, total);
    return { day, business: total - a, after: a, bookings: r?.bookings ?? 0, median: r?.median_response_seconds ?? null, p95: r?.p95_response_seconds ?? null };
  });
  const weeks = new Map<string, { week: string; hot: number; warm: number; cold: number }>();
  for (const r of rows) {
    const d = new Date(`${r.day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const week = d.toISOString().slice(0, 10);
    const w = weeks.get(week) ?? { week, hot: 0, warm: 0, cold: 0 };
    w.hot += r.leads_hot; w.warm += r.leads_warm; w.cold += r.leads_cold;
    weeks.set(week, w);
  }

  const empty = enquiries === 0;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="sr-only">Overview</h1>
        <RangePicker base={`/c/${slug}`} current={range.key} />
        <p className="text-sm text-ink-muted">Compared with the {range.days} days before</p>
      </div>

      {empty ? (
        <section className="mt-10 max-w-xl">
          <p className="font-display text-2xl font-bold tracking-[-0.01em]">No enquiries yet in this period.</p>
          <p className="mt-3 text-ink-muted">
            When patients message {settings.assistantName} on WhatsApp, SMS or your website chat, the conversations, bookings and reply times appear here.
            Try a longer period, or send a test message to your clinic number.
          </p>
        </section>
      ) : (
        <>
          <p className="font-display mt-8 max-w-3xl text-xl leading-snug font-bold tracking-[-0.01em] sm:text-2xl">
            {settings.assistantName} handled {formatCount(enquiries)} {enquiries === 1 ? "enquiry" : "enquiries"} and booked {formatCount(bookings)} {bookings === 1 ? "appointment" : "appointments"}.
            {afterHours > 0 && <span className="text-ink-muted"> {afterShare}% of enquiries came in while the clinic was closed.</span>}
          </p>

          <div className="mt-8"><KpiRow items={kpis} /></div>

          <div className="mt-8 grid gap-5">
            <Panel title="Enquiries per day" description="Split by whether the clinic was open when the conversation started.">
              <EnquiriesChart data={daily.map(({ day, business, after: a }) => ({ day, business, after: a }))} />
            </Panel>
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="When enquiries arrive" description="Each square is an hour of the week. Your opening hours are outlined.">
                <Heatmap cells={hours} hours={settings.hours} />
              </Panel>
              <Panel title="Reply time" description="From a patient's message to the first reply, by day.">
                <ReplyTimeChart data={daily.map(({ day, median, p95 }) => ({ day, median, p95 }))} />
              </Panel>
              <Panel title="Bookings made per day" description="Appointments the assistant booked into your calendar.">
                <BookingsChart data={daily.map(({ day, bookings: b }) => ({ day, bookings: b }))} />
              </Panel>
              {hasLeads && (
                <Panel title="New leads by score" description="Per week, from your website form, ads and chat.">
                  <LeadsChart data={[...weeks.values()]} />
                </Panel>
              )}
            </div>
            <details className="rounded-lg border border-rule bg-surface p-4 text-sm sm:p-5">
              <summary className="cursor-pointer font-semibold">Show the daily figures as a table</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="tabular w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-rule text-ink-muted">
                      <th className="py-2 font-semibold">Day</th>
                      <th className="py-2 text-right font-semibold">Enquiries</th>
                      <th className="py-2 text-right font-semibold">After hours</th>
                      <th className="py-2 text-right font-semibold">Bookings</th>
                      <th className="py-2 text-right font-semibold">Typical reply</th>
                      <th className="py-2 text-right font-semibold">Handed to team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...daily].reverse().map((d) => (
                      <tr key={d.day} className="border-b border-rule last:border-0">
                        <td className="py-1.5">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</td>
                        <td className="py-1.5 text-right">{d.business + d.after}</td>
                        <td className="py-1.5 text-right">{d.after}</td>
                        <td className="py-1.5 text-right">{d.bookings}</td>
                        <td className="py-1.5 text-right">{formatDuration(d.median)}</td>
                        <td className="py-1.5 text-right">{metricsByDay.get(d.day)?.escalations ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
