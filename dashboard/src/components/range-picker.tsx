import Link from "next/link";
import { RANGES, type RangeKey } from "@/lib/range";

// Plain links, so the range lives in the URL (shareable, back button works) and needs no client JS.
export function RangePicker({ base, current }: { base: string; current: RangeKey }) {
  return (
    <nav aria-label="Reporting period" className="inline-flex flex-wrap gap-1 rounded-lg border border-rule bg-surface p-1">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`${base}?range=${r.key}`}
          aria-current={r.key === current ? "page" : undefined}
          className={`flex h-10 items-center rounded-md px-3 text-sm font-semibold ${r.key === current ? "bg-gumleaf text-ink" : "text-ink-muted hover:text-ink"}`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
