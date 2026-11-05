import type { Metadata } from "next";
import Link from "next/link";
import { Faq, faqJsonLd } from "@/components/faq";
import { JsonLd } from "@/components/json-ld";
import { alternates, localePath, type Locale } from "@/content/locales";
import { ALWAYS_INCLUDED, BUNDLE, CARE_PLANS, NEVER_INCLUDED, PACKAGES, TERMS, usd } from "@/content/packages";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Pricing: AI receptionist and automation packages",
    description: "Fixed setup prices from USD 1,500, care plans from USD 300 a month, usage at cost plus 20%. See exactly what each package includes.",
    alternates: alternates(locale, "/packages"),
  };
}

const PRICING_FAQ = [
  { q: "Why a setup fee and a care plan?", a: "The setup fee pays for the 14-day build. The care plan keeps it running: hosting, monitoring, provider keys, and a set number of hours of changes each month." },
  { q: "What is usage pass-through?", a: TERMS.usage },
  { q: "How do we pay?", a: `${TERMS.payment} Care plans are billed in advance on the 1st of each month.` },
  { q: "Can we cancel?", a: `Care plans have a 3-month minimum, then run month to month. You keep your data either way.` },
];

export default async function Packages({ params }: Props) {
  const { locale } = await params;
  const p = (path: string) => localePath(locale, path);
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-10 sm:pt-16">
        <h1 className="display max-w-3xl text-4xl sm:text-5xl">Fixed prices. You know the cost before we start.</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-muted">A one-off setup fee per package, a monthly care plan, and usage passed through at cost. All prices in US dollars.</p>
      </section>

      <section aria-labelledby="pkgs" className="mx-auto max-w-6xl px-5 pb-16">
        <h2 id="pkgs" className="sr-only">Packages</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {PACKAGES.map((pk) => (
            <article key={pk.slug} className={`flex flex-col rounded-xl border p-6 ${pk.letter === "A" ? "border-2 border-brand" : "border-rule bg-surface"}`}>
              <p className="text-sm font-semibold text-ink-muted">Package {pk.letter}</p>
              <h3 className="font-display mt-1 text-2xl font-bold">{pk.name}</h3>
              <p className="font-display tabular mt-2 text-3xl font-bold">{usd(pk.price)}</p>
              <p className="text-sm text-ink-muted">{pk.priceNote}</p>
              <p className="mt-4 flex-1 text-ink-muted">{pk.summary}</p>
              {pk.addOns?.map((a) => <p key={a.name} className="mt-3 text-sm"><span className="font-semibold">{a.price}</span> {a.name.toLowerCase()}</p>)}
              <Link href={p(`/packages/${pk.slug}`)} className="mt-5 inline-flex h-11 w-fit items-center rounded-md border border-rule px-4 font-semibold hover:border-brand">
                What&apos;s in {pk.name}
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-brand-soft p-6">
          <div>
            <h3 className="font-display text-xl font-bold">Bundle: {BUNDLE.name} ({BUNDLE.letters})</h3>
            <p className="mt-1 text-ink-muted">{BUNDLE.note}</p>
          </div>
          <p className="font-display tabular text-3xl font-bold">{usd(BUNDLE.price)}</p>
        </div>
      </section>

      <section aria-labelledby="care" className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 id="care" className="display text-3xl">Care plans</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">{TERMS.carePlanMinimum} {TERMS.extraHours}</p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-rule">
                  {CARE_PLANS.map((c) => (
                    <th key={c.name} scope="col" className="w-1/3 py-3 pr-6 align-bottom">
                      <span className="font-display block text-xl font-bold">{c.name}</span>
                      <span className="font-display tabular block text-2xl font-bold">{usd(c.price)}<span className="text-base font-normal text-ink-muted"> a month</span></span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {CARE_PLANS.map((c) => (
                    <td key={c.name} className="py-4 pr-6 align-top">
                      <ul className="space-y-2">
                        {c.includes.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}
                      </ul>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-6 max-w-3xl text-ink-muted"><span className="font-semibold text-ink">Usage:</span> {TERMS.usage}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Always included</h2>
          <ul className="mt-4 space-y-3">
            {ALWAYS_INCLUDED.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Not something we do</h2>
          <ul className="mt-4 space-y-3 text-ink-muted">
            {NEVER_INCLUDED.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" />{x}</li>)}
          </ul>
        </div>
      </section>

      <Faq items={PRICING_FAQ} heading="Pricing questions" />
      <JsonLd data={faqJsonLd(PRICING_FAQ)} />
    </>
  );
}
