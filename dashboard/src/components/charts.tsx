"use client";
// Charts follow the dataviz rules: one y-axis each, thin marks with 4px rounded data-ends, a 2px surface
// gap between stacked segments, a recessive grid, a legend plus direct labels for 2+ series, a hover
// tooltip, and a table view (rendered by the page). Colours are the validated chart tokens in globals.css.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

const axis = { stroke: "var(--rule)", tick: { fill: "var(--ink-muted)", fontSize: 12 }, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="0" />;
const dayTick = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-2">
          {i.dashed
            ? <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke={i.color} strokeWidth="2" strokeDasharray="4 3" /></svg>
            : <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: i.color }} aria-hidden="true" />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="tabular rounded-md border border-rule bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-muted">
          {r.color && <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: r.color }} />}
          <span className="flex-1">{r.label}</span>
          <span className="font-semibold text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function EnquiriesChart({ data }: { data: { day: string; business: number; after: number }[] }) {
  const content = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]!.payload as { business: number; after: number };
    return <TooltipBox title={dayTick(String(label))} rows={[
      { label: "Open hours", value: String(row.business), color: "var(--series-business)" },
      { label: "After hours", value: String(row.after), color: "var(--series-after)" },
      { label: "Total", value: String(row.business + row.after) },
    ]} />;
  };
  return (
    <div>
      <Legend items={[{ label: "During opening hours", color: "var(--series-business)" }, { label: "After hours", color: "var(--series-after)" }]} />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%">
            {grid}
            <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={24} {...axis} />
            <YAxis allowDecimals={false} width={40} {...axis} />
            <Tooltip content={content} cursor={{ fill: "var(--brand-soft)", opacity: 0.5 }} />
            <Bar dataKey="business" stackId="e" fill="var(--series-business)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="after" stackId="e" fill="var(--series-after)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const secs = (s: number | null | undefined) => (s === null || s === undefined ? "–" : s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 6) / 10} min`);

export function ReplyTimeChart({ data }: { data: { day: string; median: number | null; p95: number | null }[] }) {
  const content = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]!.payload as { median: number | null; p95: number | null };
    return <TooltipBox title={dayTick(String(label))} rows={[
      { label: "Typical (median)", value: secs(row.median), color: "var(--series-business)" },
      { label: "Slowest 5% (p95)", value: secs(row.p95), color: "var(--ink-muted)" },
    ]} />;
  };
  return (
    <div>
      <Legend items={[{ label: "Typical reply", color: "var(--series-business)" }, { label: "Slowest 5%", color: "var(--ink-muted)", dashed: true }]} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            {grid}
            <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={32} {...axis} />
            <YAxis width={44} tickFormatter={(v: number) => secs(v)} {...axis} />
            <Tooltip content={content} cursor={{ stroke: "var(--rule)", strokeWidth: 1 }} />
            <Line dataKey="p95" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="median" stroke="var(--series-business)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BookingsChart({ data }: { data: { day: string; bookings: number }[] }) {
  const content = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    return <TooltipBox title={dayTick(String(label))} rows={[{ label: "Bookings made", value: String(payload[0]!.value) }]} />;
  };
  return (
    <div className="h-56 pt-7">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          {grid}
          <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={32} {...axis} />
          <YAxis allowDecimals={false} width={40} {...axis} />
          <Tooltip content={content} cursor={{ fill: "var(--brand-soft)", opacity: 0.5 }} />
          <Bar dataKey="bookings" fill="var(--series-business)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeadsChart({ data }: { data: { week: string; hot: number; warm: number; cold: number }[] }) {
  const content = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]!.payload as { hot: number; warm: number; cold: number };
    return <TooltipBox title={`Week of ${dayTick(String(label))}`} rows={[
      { label: "Hot", value: String(row.hot), color: "var(--grade-hot)" },
      { label: "Warm", value: String(row.warm), color: "var(--grade-warm)" },
      { label: "Cold", value: String(row.cold), color: "var(--grade-cold)" },
    ]} />;
  };
  return (
    <div>
      <Legend items={[{ label: "Hot", color: "var(--grade-hot)" }, { label: "Warm", color: "var(--grade-warm)" }, { label: "Cold", color: "var(--grade-cold)" }]} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
            {grid}
            <XAxis dataKey="week" tickFormatter={dayTick} {...axis} />
            <YAxis allowDecimals={false} width={40} {...axis} />
            <Tooltip content={content} cursor={{ fill: "var(--brand-soft)", opacity: 0.5 }} />
            <Bar dataKey="hot" stackId="l" fill="var(--grade-hot)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="warm" stackId="l" fill="var(--grade-warm)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="cold" stackId="l" fill="var(--grade-cold)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
