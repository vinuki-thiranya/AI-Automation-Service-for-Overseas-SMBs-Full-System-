import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Membership } from "@/lib/data";

const ROLE: Record<string, string> = { agency: "Agency", owner: "Owner", staff: "Staff" };

// A plain <details> menu: works with keyboard and screen readers without client JS.
export function ClientSwitcher({ current, memberships, agency }: { current: Membership | null; memberships: Membership[]; agency: boolean }) {
  const others = memberships.filter((m) => m.slug !== current?.slug);
  const label = current ? (
    <span className="min-w-0">
      <span className="line-clamp-2 block font-bold leading-snug">{current.name}</span>
      <span className="block text-sm text-ink-muted">{ROLE[current.role]}{current.status === "demo" ? ", demo data" : ""}</span>
    </span>
  ) : (
    <span className="min-w-0">
      <span className="block font-bold">All clients</span>
      <span className="block text-sm text-ink-muted">Agency</span>
    </span>
  );
  if (others.length === 0 && !(agency && current)) return <div className="px-3">{label}</div>;
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-gumleaf/60 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        <span className="sr-only">Switch clinic</span>
      </summary>
      <ul className="absolute inset-x-0 z-20 mt-1 rounded-md border border-rule bg-surface p-1 shadow-sm">
        {agency && current && <li><Link href="/agency" className="block rounded px-3 py-2.5 font-semibold hover:bg-gumleaf">All clients</Link></li>}
        {others.map((m) => (
          <li key={m.slug}><Link href={`/c/${m.slug}`} className="block rounded px-3 py-2.5 hover:bg-gumleaf">{m.name}</Link></li>
        ))}
      </ul>
    </details>
  );
}
