import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Faq, faqJsonLd } from "@/components/faq";
import { JsonLd } from "@/components/json-ld";
import { MissedCallsCalculator } from "@/components/missed-calls-calculator";
import { LOCALES, alternates, localePath, siteUrl, type Locale } from "@/content/locales";
import { ALWAYS_INCLUDED, CARE_PLANS, PACKAGES, TERMS, packageBySlug, usd } from "@/content/packages";

type Props = { params: Promise<{ locale: Locale; pkg: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => PACKAGES.map((p) => ({ locale, pkg: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, pkg } = await params;
  const p = packageBySlug(pkg);
  if (!p) return {};
  return { title: p.title, description: p.description, alternates: alternates(locale, `/packages/${p.slug}`) };
}

export default async function PackagePage({ params }: Props) {
  const { locale, pkg } = await params;
  const p = packageBySlug(pkg);
  if (!p) notFound();
  const path = (to: string) => localePath(locale, to);
  const others = PACKAGES.filter((x) => x.slug !== p.slug);

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Service",
        name: p.name,
        serviceType: p.name,
        description: p.summary,
        provider: { "@type": "Organization", name: "Nuvadesk", url: siteUrl() },
        areaServed: ["AU", "GB", "US"],
        offers: { "@type": "Offer", price: p.price, priceCurrency: "USD", description: `Setup, ${p.priceNote}` },
      }} />
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-12 sm:pt-16">
        <p className="font-semibold text-brand"><Link href={path("/packages")} className="underline-offset-4 hover:underline">Packages</Link> / Package {p.letter}</p>
        <h1 className="display mt-3 max-w-3xl text-4xl sm:text-5xl">{p.name}</h1>
        <p className="mt-5 max-w-2xl text-xl text-ink-muted">{p.summary}</p>
        <p className="font-display tabular mt-8 text-3xl font-bold">{usd(p.price)} <span className="text-lg font-normal text-ink-muted">{p.priceNote}</span></p>
        <p className="mt-1 text-ink-muted">Plus a care plan from {usd(CARE_PLANS[0].price)} a month. {TERMS.payment}</p>
        <Link href={path("/contact")} className="mt-8 inline-flex h-12 items-center rounded-md bg-brand px-5 text-lg font-semibold text-on-brand">Book a 20-minute call</Link>
      </section>

      <section className="border-y border-rule bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-2xl font-bold">What it does</h2>
            <ul className="mt-5 space-y-4">
              {p.includes.map((x) => <li key={x} className="flex gap-3 text-lg"><span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}
            </ul>
            {p.addOns && (
              <ul className="mt-8 space-y-2 border-t border-rule pt-6">
                {p.addOns.map((a) => <li key={a.name}><span className="font-semibold">{a.price}</span>: {a.name}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Who it&apos;s for</h2>
            <p className="mt-4 text-lg text-ink-muted">{p.for}</p>
            <h2 className="font-display mt-10 text-2xl font-bold">Always included</h2>
            <ul className="mt-4 space-y-2 text-ink-muted">
              {ALWAYS_INCLUDED.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {p.slug === "receptionist" && (
        <section aria-labelledby="calculator" className="mx-auto max-w-6xl px-5 pt-16">
          <h2 id="calculator" className="display text-3xl">What missed calls cost your clinic</h2>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">Move the sliders to match your week. The numbers are yours, so is the estimate.</p>
          <div className="mt-8"><MissedCallsCalculator locale={locale} setupUsd={p.price} carePlanUsd={CARE_PLANS[0].price} /></div>
        </section>
      )}

      <Faq items={p.faq} heading={`${p.name}: common questions`} />
      <JsonLd data={faqJsonLd(p.faq)} />

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-xl font-bold">Other packages</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={path(`/packages/${o.slug}`)} className="block rounded-lg border border-rule p-4 hover:border-brand">
                <span className="font-bold">{o.name}</span>
                <span className="tabular mt-1 block text-ink-muted">{usd(o.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
