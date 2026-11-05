import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { localePath, type Locale } from "@/content/locales";
import { VERTICALS } from "@/content/verticals";
import { Wordmark } from "./wordmark";

// Server-rendered; the menus are <details>, so the header ships no JavaScript.
export function Header({ locale }: { locale: Locale }) {
  const p = (path: string) => localePath(locale, path);
  const links = [
    { href: p("/packages"), label: "Packages and pricing" },
    { href: p("/case-studies"), label: "Case study" },
    ...(locale === "en-au" ? [{ href: "/blog", label: "Blog" }] : []),
    { href: p("/about"), label: "About" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-surface focus:p-3">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href={p("/")} aria-label="Nuvadesk home"><Wordmark /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <details className="group relative">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-md px-3 font-semibold text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              Who it&apos;s for <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="menu-panel absolute top-12 left-0 w-56 rounded-md border border-rule bg-surface p-1 shadow-sm">
              {VERTICALS.map((v) => (
                <li key={v.slug}><Link href={p(`/for/${v.slug}`)} className="block rounded px-3 py-2.5 hover:bg-brand-soft">{v.name}</Link></li>
              ))}
            </ul>
          </details>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex h-11 items-center rounded-md px-3 font-semibold text-ink-muted hover:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={p("/contact")} className="hidden h-11 items-center rounded-md bg-brand px-4 font-semibold text-on-brand sm:flex">Book a 20-minute call</Link>
          <details className="group lg:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu size={22} aria-hidden="true" className="group-open:hidden" />
              <X size={22} aria-hidden="true" className="hidden group-open:block" />
            </summary>
            <nav aria-label="Mobile" className="menu-panel absolute inset-x-0 top-16 border-b border-rule bg-paper px-5 pt-2 pb-6 shadow-sm">
              <p className="pt-2 pb-1 text-sm text-ink-muted">Who it&apos;s for</p>
              <ul>
                {VERTICALS.map((v) => <li key={v.slug}><Link href={p(`/for/${v.slug}`)} className="block py-3 font-semibold">{v.name}</Link></li>)}
              </ul>
              <ul className="mt-2 border-t border-rule pt-2">
                {links.map((l) => <li key={l.href}><Link href={l.href} className="block py-3 font-semibold">{l.label}</Link></li>)}
              </ul>
              <Link href={p("/contact")} className="mt-4 flex h-12 items-center justify-center rounded-md bg-brand font-semibold text-on-brand">Book a 20-minute call</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
