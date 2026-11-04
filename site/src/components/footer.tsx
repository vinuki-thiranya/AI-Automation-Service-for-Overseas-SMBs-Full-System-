import Link from "next/link";
import { LOCALE_INFO, LOCALES, localePath, type Locale } from "@/content/locales";
import { PACKAGES } from "@/content/packages";
import { VERTICALS } from "@/content/verticals";
import { Wordmark } from "./wordmark";

export const contactEmail = () => process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@nuvadesk.ai";

export function Footer({ locale, path = "/" }: { locale: Locale; path?: string }) {
  const p = (to: string) => localePath(locale, to);
  return (
    <footer className="after-hours">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-ink-muted">An AI front desk for clinics, installed in 14 days.</p>
          <p className="mt-4"><a href={`mailto:${contactEmail()}`} className="font-semibold underline-offset-4 hover:underline">{contactEmail()}</a></p>
        </div>
        <nav aria-label="Packages">
          <h2 className="font-bold">Packages</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            {PACKAGES.map((pk) => <li key={pk.slug}><Link href={p(`/packages/${pk.slug}`)} className="hover:text-ink">{pk.name}</Link></li>)}
            <li><Link href={p("/packages")} className="hover:text-ink">Care plans and pricing</Link></li>
          </ul>
        </nav>
        <nav aria-label="Who it's for">
          <h2 className="font-bold">Who it&apos;s for</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            {VERTICALS.map((v) => <li key={v.slug}><Link href={p(`/for/${v.slug}`)} className="hover:text-ink">{v.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Company">
          <h2 className="font-bold">Company</h2>
          <ul className="mt-3 space-y-2 text-ink-muted">
            <li><Link href={p("/about")} className="hover:text-ink">About</Link></li>
            <li><Link href={p("/case-studies")} className="hover:text-ink">Case study</Link></li>
            {locale === "en-au" && <li><Link href="/blog" className="hover:text-ink">Blog</Link></li>}
            <li><Link href={p("/contact")} className="hover:text-ink">Contact</Link></li>
            <li><Link href={p("/privacy")} className="hover:text-ink">Privacy policy</Link></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-6 text-sm text-ink-muted">
        <p>© {new Date().getFullYear()} Nuvadesk. Prices in US dollars.</p>
        <nav aria-label="Region">
          <ul className="flex gap-4">
            {LOCALES.map((l) => (
              <li key={l}>
                <Link href={localePath(l, path)} hrefLang={LOCALE_INFO[l].hreflang} aria-current={l === locale ? "true" : undefined}
                  className={l === locale ? "font-semibold text-ink" : "hover:text-ink"}>
                  {LOCALE_INFO[l].label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
