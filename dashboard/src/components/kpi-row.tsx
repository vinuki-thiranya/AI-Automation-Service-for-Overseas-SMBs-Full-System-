"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

export interface Kpi {
  label: string;
  value: number | null;
  display: string;                // final formatted value
  format: "count" | "text";       // only counts animate
  delta?: { text: string; direction: "up" | "down" | "flat"; good: boolean } | null;
  note?: string;
}

function Figure({ kpi }: { kpi: Kpi }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || kpi.format !== "count" || kpi.value === null) return;
    const target = kpi.value;
    const controls = animate(0, target, {
      duration: 0.6, ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString("en-AU"); },
      onComplete: () => { el.textContent = kpi.display; },
    });
    return () => controls.stop();
  }, [kpi.value, kpi.display, kpi.format, reduce]);
  return <span ref={ref}>{kpi.display}</span>;
}

// The overview's one orchestrated motion: figures count up once on load (skipped with reduced motion).
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-rule sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => (
        <div key={k.label} className="border-rule px-1 py-5 sm:px-4 [&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-b-0 sm:border-r sm:last:border-r-0 sm:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:last:border-r-0">
          <dt className="text-sm text-ink-muted">{k.label}</dt>
          <dd className="tabular mt-1 text-2xl font-bold tracking-[-0.01em]"><Figure kpi={k} /></dd>
          {k.delta ? (
            <dd className={`mt-1 text-sm font-semibold ${k.delta.direction === "flat" ? "text-ink-muted" : k.delta.good ? "text-eucalyptus" : "text-signal"}`}>
              {k.delta.text} <span className="font-normal text-ink-muted">vs previous</span>
            </dd>
          ) : k.note ? <dd className="mt-1 text-sm text-ink-muted">{k.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
