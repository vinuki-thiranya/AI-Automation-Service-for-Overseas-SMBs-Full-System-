import Link from "next/link";
import { RANGES, type RangeKey } from "@/lib/range";

// Plain links, so the range lives in the URL (shareable, back button works) and needs no client JS.
// Phones get the short labels in four equal cells on one row; the full label stays for screen readers.
export function RangePicker({ base, current }: { base: string; current: RangeKey }) {
  return (
    <nav aria-label="Reporting period" className="grid w-full grid-cols-4 gap-1 rounded-lg border border-rule bg-surface p-1 sm:inline-flex sm:w-auto">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`${base}?range=${r.key}`}
          aria-current={r.key === current ? "page" : undefined}
          className={`flex h-11 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-semibold sm:h-10 sm:px-3 ${r.key === current ? "bg-gumleaf text-ink" : "text-ink-muted hover:text-ink"}`}
        >
          <span className="sm:hidden" aria-hidden="true">{r.short}</span>
          <span className="sr-only sm:not-sr-only">{r.label}</span>
        </Link>
      ))}
    </nav>
  );
}
