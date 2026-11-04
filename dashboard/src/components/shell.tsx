"use client";
import { Inbox, LayoutDashboard, LifeBuoy, Menu, MessagesSquare, Receipt, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "./wordmark";

export interface NavItem {
  href: string;
  label: string;
  icon: "overview" | "conversations" | "approvals" | "billing" | "help";
  count?: number;
  countLabel?: string;
}
const ICONS = { overview: LayoutDashboard, conversations: MessagesSquare, approvals: Inbox, billing: Receipt, help: LifeBuoy };

export function Shell({ nav, header, footer, children }: { nav: NavItem[]; header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rail = (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="hidden px-3 pt-2 lg:block"><Wordmark /></Link>
      {header}
      <ul className="flex flex-col gap-1">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.icon === "overview" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-md px-3 font-semibold ${active ? "bg-gumleaf text-ink" : "text-ink-muted hover:bg-gumleaf/60 hover:text-ink"}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="tabular rounded-full bg-signal-wash px-2 py-0.5 text-xs font-bold text-signal">
                    {item.count}<span className="sr-only"> {item.countLabel}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-4">{footer}</div>
    </nav>
  );

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper/95 px-4 backdrop-blur lg:hidden">
        <Link href="/"><Wordmark /></Link>
        <button
          type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 w-[85%] max-w-xs overflow-y-auto border-r border-rule bg-paper">
            <button
              type="button" onClick={() => setOpen(false)} aria-label="Close menu"
              className="absolute top-3 right-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-md"
            >
              <X size={20} aria-hidden="true" />
            </button>
            {rail}
          </div>
        </div>
      )}
      <aside className="sticky top-0 hidden h-dvh border-r border-rule lg:block">{rail}</aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
