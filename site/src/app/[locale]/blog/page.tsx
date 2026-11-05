import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/content/locales";
import { POSTS } from "@/content/blog/posts";

// The blog is written for Australian clinics and lives only at /blog (no hreflang alternates).
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ locale: "en-au" }];
}

export const metadata: Metadata = {
  title: "Blog: running a clinic front desk that doesn't miss patients",
  description: "Practical guides for dental and physio clinic owners: missed calls, after-hours messages, booking by WhatsApp, and what automation really costs.",
  alternates: { canonical: `${siteUrl()}/blog` },
};

const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function Blog() {
  return (
    <section className="mx-auto max-w-4xl px-5 pt-12 pb-20 sm:pt-16">
      <h1 className="display text-4xl sm:text-5xl">The front desk, written down</h1>
      <p className="mt-5 max-w-2xl text-xl text-ink-muted">Practical guides for clinic owners and practice managers. No hype, no made-up statistics.</p>
      <ul className="mt-12 divide-y divide-rule border-y border-rule">
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="group block py-6">
              <h2 className="font-display text-xl font-bold group-hover:text-brand">{p.title}</h2>
              <p className="mt-2 text-ink-muted">{p.description}</p>
              <p className="mt-2 text-sm text-ink-muted"><time dateTime={p.date}>{fmt(p.date)}</time></p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
