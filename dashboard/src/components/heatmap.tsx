import Link from "next/link";
import type { Hours } from "@/lib/data";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** True when the hour starting at `hour` is inside the clinic's opening hours that weekday. */
export function isOpenHour(hours: Hours, weekday: number, hour: number): boolean {
  const periods = hours[DAYS[weekday - 1]!] ?? [];
  const minute = hour * 60;
  return periods.some((p) => {
    const [oh, om] = p.open.split(":").map(Number) as [number, number];
    const [ch, cm] = p.close.split(":").map(Number) as [number, number];
    return minute >= oh * 60 + om && minute < ch * 60 + cm;
  });
}

const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

// Hour × weekday grid. Cells inside opening hours use the business-hours hue and an outline; cells outside
// use the after-hours hue. Intensity is the share of the busiest hour. The grid is a picture; the same
// numbers are in the table below it for screen readers and anyone who prefers figures.
// With `conversationsHref`, a cell with enquiries opens those conversations (pointer and touch); the table
// carries the same links per day for keyboard and screen-reader users, so the grid needs no 168 tab stops.
export function Heatmap({ cells, hours, conversationsHref }: { cells: { weekday: number; hour: number; enquiries: number }[]; hours: Hours; conversationsHref?: string }) {
  const cellHref = (day: number, hour?: number) => conversationsHref && `${conversationsHref}${conversationsHref.includes("?") ? "&" : "?"}day=${day}${hour === undefined ? "" : `&hour=${hour}`}`;
  const grid = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, Number(c.enquiries)]));
  const max = Math.max(1, ...cells.map((c) => Number(c.enquiries)));
  const totals = DAY_LABEL.map((_, i) => {
    let open = 0, closed = 0;
    for (let h = 0; h < 24; h++) {
      const n = grid.get(`${i + 1}:${h}`) ?? 0;
      if (isOpenHour(hours, i + 1, h)) open += n; else closed += n;
    }
    return { open, closed };
  });

  return (
    <figure>
      <div className="overflow-x-auto" aria-hidden="true">
        <div className="grid min-w-[300px] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px]">
          {DAY_LABEL.map((d, i) => (
            <div key={d} className="contents">
              <div className="pr-1 text-xs leading-[18px] text-ink-muted">{d}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const n = grid.get(`${i + 1}:${h}`) ?? 0;
                const open = isOpenHour(hours, i + 1, h);
                const strength = n === 0 ? 0 : 0.18 + 0.82 * (n / max);
                const props = {
                  title: `${d} ${hourLabel(h)}: ${n} ${n === 1 ? "enquiry" : "enquiries"}${open ? "" : " (after hours)"}${n && conversationsHref ? ". Click to see them." : ""}`,
                  className: `block h-[18px] rounded-[3px] ${open ? "ring-1 ring-series-business/40 ring-inset" : ""}`,
                  style: {
                    backgroundColor: n === 0 ? "var(--paper)" : `color-mix(in oklab, var(${open ? "--series-business" : "--series-after"}) ${Math.round(strength * 100)}%, var(--surface))`,
                  },
                };
                const href = n ? cellHref(i + 1, h) : undefined;
                return href
                  ? <Link key={h} href={href} tabIndex={-1} {...props} className={`${props.className} transition-transform hover:scale-125 hover:ring-2 hover:ring-ink`} />
                  : <div key={h} {...props} />;
              })}
            </div>
          ))}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="pt-1 text-center text-[11px] text-ink-muted">{h % 6 === 0 ? hourLabel(h) : ""}</div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] bg-series-business ring-1 ring-series-business/40" /> Open hours</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] bg-series-after" /> After hours</span>
        <span>Darker means more enquiries</span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink-muted hover:text-ink">Show as a table</summary>
        <table className="tabular mt-2 w-full max-w-md text-left">
          <thead><tr className="border-b border-rule"><th className="py-1.5 font-semibold">Day</th><th className="py-1.5 text-right font-semibold">Open hours</th><th className="py-1.5 text-right font-semibold">After hours</th>{conversationsHref && <th className="py-1.5"><span className="sr-only">Conversations</span></th>}</tr></thead>
          <tbody>
            {DAY_LABEL.map((d, i) => (
              <tr key={d} className="border-b border-rule last:border-0">
                <td className="py-1.5">{d}</td><td className="py-1.5 text-right">{totals[i]!.open}</td><td className="py-1.5 text-right">{totals[i]!.closed}</td>
                {conversationsHref && <td className="py-1.5 pl-4 text-right">{totals[i]!.open + totals[i]!.closed > 0 && <Link href={cellHref(i + 1)!} className="font-semibold text-brand underline-offset-4 hover:underline">See them<span className="sr-only"> ({d})</span></Link>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
