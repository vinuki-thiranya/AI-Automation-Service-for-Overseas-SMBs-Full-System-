import type { Metadata } from "next";
import Link from "next/link";
import { DemoSection } from "@/components/demo";
import { Faq, faqJsonLd } from "@/components/faq";
import { Hero } from "@/components/hero";
import { JsonLd } from "@/components/json-ld";
import { LOCALE_INFO, alternates, localePath, type Locale } from "@/content/locales";
import { ALWAYS_INCLUDED, BUNDLE, PACKAGES, usd } from "@/content/packages";
import { VERTICALS } from "@/content/verticals";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const country = LOCALE_INFO[locale].country;
  return {
    title: { absolute: `AI receptionist for dental and physio clinics in ${country} | Nuvadesk` },
    description: `Nuvadesk installs an AI front desk for clinics in 14 days: WhatsApp, SMS and web chat that answers patients, books appointments and texts back missed calls. Fixed price.`,
    alternates: alternates(locale, "/"),
  };
}

const STEPS = [
  { title: "Discovery call and a one-page scope", body: "45 minutes on how enquiries reach you today and what a good week looks like. You get a written scope and a fixed price before paying anything." },
  { title: "14-day build", body: "We connect your WhatsApp, SMS, website chat and calendar, load your prices and policies, and run it through 50 test conversations, including the awkward ones." },
  { title: "Live, with your team trained", body: "A recorded walkthrough, a 60-minute training session and a one-page guide. The assistant goes live, and your team gets a summary whenever it hands over." },
];

const HOME_FAQ = [
  { q: "What does it cost?", a: `Setup is a fixed price: ${usd(2500)} for the AI Receptionist, or ${usd(BUNDLE.price)} with lead follow-up. A care plan from ${usd(300)} a month covers hosting, monitoring and changes. Usage (messages and AI) is passed through at cost plus 20%, capped.` },
  { q: "Will patients know it's not a person?", a: "Yes. Every conversation starts by saying it's the clinic's virtual assistant, and a team member can take over at any time." },
  { q: "What if it gets something wrong?", a: "It only quotes prices from your price list, never gives clinical advice, and hands over to your team when it isn't confident. Every conversation is in your dashboard, searchable for 12 months." },
  { q: "Do we have to change our phone number or software?", a: "No. It works with your existing number and books into the calendar or practice system you already use." },
];

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const info = LOCALE_INFO[locale];
  const p = (path: string) => localePath(locale, path);
  const receptionist = PACKAGES[0]!;

  return (
    <>
      <Hero
        headline="Your front desk, still answering at 9:47 pm."
        lede={`We install an AI front desk for dental and physio ${info.clinicWord}s in 14 days, so you never miss another patient. Fixed price, cancel any time, and we only win when your calendar fills.`}
        ctaHref={p("/contact")}
        pricingHref={p("/packages")}
      />

      <section className="after-hours" aria-labelledby="problem">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <h2 id="problem" className="display max-w-3xl text-3xl sm:text-4xl">Patients don&apos;t stop messaging when the front desk goes home.</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { t: "The call that rings out", b: "Your receptionist is with a patient. The caller tries the next clinic on Google. With missed-call text-back, they get a reply in 30 seconds instead." },
              { t: "The message at 9:47 pm", b: "It sits until morning, and by then they've booked elsewhere. Your assistant answers in seconds and books into tomorrow's free slot." },
              { t: "The question you answer every day", b: "Parking, prices, health funds, Saturday hours. Answered from your own policies, the same way every time." },
            ].map((x) => (
              <div key={x.t}>
                <h3 className="text-lg font-bold">{x.t}</h3>
                <p className="mt-2 text-ink-muted">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <h2 id="how" className="display text-3xl">How it works</h2>
        <ol className="mt-10 grid gap-10 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-brand pt-5">
              <p className="tabular text-sm font-bold text-brand">Step {i + 1}</p>
              <h3 className="font-display mt-1 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="pricing" className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="pricing" className="display text-3xl">Fixed prices, in US dollars</h2>
            <Link href={p("/packages")} className="font-semibold text-brand underline-offset-4 hover:underline">All packages and care plans</Link>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border-2 border-brand p-6">
              <p className="font-semibold text-brand">Most clinics start here</p>
              <h3 className="font-display mt-1 text-2xl font-bold">{receptionist.name}</h3>
              <p className="font-display tabular mt-2 text-3xl font-bold">{usd(receptionist.price)} <span className="text-base font-normal text-ink-muted">{receptionist.priceNote}</span></p>
              <p className="mt-3 text-ink-muted">{receptionist.summary}</p>
              <ul className="mt-5 space-y-2">
                {receptionist.includes.slice(0, 4).map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}
              </ul>
              <Link href={p(`/packages/${receptionist.slug}`)} className="mt-6 inline-flex h-11 items-center rounded-md bg-brand px-4 font-semibold text-on-brand">See what&apos;s included</Link>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-rule p-6">
                <h3 className="text-lg font-bold">{BUNDLE.name}</h3>
                <p className="font-display tabular mt-1 text-2xl font-bold">{usd(BUNDLE.price)}</p>
                <p className="mt-2 text-ink-muted">{BUNDLE.note}</p>
              </div>
              <div className="rounded-xl border border-rule p-6">
                <h3 className="text-lg font-bold">Care plan</h3>
                <p className="font-display tabular mt-1 text-2xl font-bold">from {usd(300)} <span className="text-base font-normal text-ink-muted">a month</span></p>
                <p className="mt-2 text-ink-muted">Hosting, monitoring and changes. Minimum 3 months, then month to month.</p>
              </div>
            </div>
          </div>
          <ul className="mt-10 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {ALWAYS_INCLUDED.map((x) => <li key={x} className="flex gap-2 text-ink-muted"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}
          </ul>
        </div>
      </section>

      <DemoSection />

      <section aria-labelledby="who" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <h2 id="who" className="display text-3xl">Built for businesses that live on enquiries</h2>
        <ul className="mt-8 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => (
            <li key={v.slug} className="border-t border-rule">
              <Link href={p(`/for/${v.slug}`)} className="group block py-5">
                <span className="text-lg font-bold group-hover:text-brand">{v.name}</span>
                <span className="mt-1 block text-ink-muted">{v.headline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Faq items={HOME_FAQ} />
      <JsonLd data={faqJsonLd(HOME_FAQ)} />

      <section className="after-hours">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center sm:py-20">
          <h2 className="display mx-auto max-w-2xl text-3xl sm:text-4xl">See what your clinic misses after hours.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">A 20-minute call. We&apos;ll look at how enquiries reach you today and tell you honestly whether this is worth it for your {info.clinicWord}.</p>
          <Link href={p("/contact")} className="mt-8 inline-flex h-12 items-center rounded-md bg-brand px-6 text-lg font-semibold text-on-brand">Book a 20-minute call</Link>
        </div>
      </section>
    </>
  );
}
