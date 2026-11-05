import type { Metadata } from "next";
import Link from "next/link";
import { alternates, localePath, type Locale } from "@/content/locales";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "About Nuvadesk",
    description: "Nuvadesk is a small automation studio that installs AI front desks for clinics, with fixed prices, a 14-day build and plain reporting.",
    alternates: alternates(locale, "/about"),
  };
}

const PRINCIPLES = [
  { t: "One thing, done properly", b: "We build front desks for clinics. Not websites, not ads, not apps. The same tested modules for every client, set up for each one." },
  { t: "The assistant knows its limits", b: "It quotes only your prices, never gives clinical advice, says it's an assistant, and hands over to your team when it isn't sure." },
  { t: "You can see everything", b: "Every conversation, booking and cost is in your dashboard. Usage is billed at cost plus 20%, and you can see the provider invoices." },
  { t: "Your data stays yours", b: "Each clinic's data is kept separate, transcripts are deleted after 12 months, and you can take everything with you if you leave." },
];

export default async function About({ params }: Props) {
  const { locale } = await params;
  return (
    <>
      <section className="mx-auto max-w-4xl px-5 pt-12 pb-12 sm:pt-16">
        <h1 className="display text-4xl sm:text-5xl">We build front desks that keep answering.</h1>
        <p className="mt-6 text-xl text-ink-muted">
          Nuvadesk is a small automation studio working with clinics in Australia, the UK and the US. We install an AI front desk on the channels
          your patients already use, connect it to your calendar, and look after it every month.
        </p>
      </section>
      <section className="border-y border-rule bg-surface">
        <div className="mx-auto grid max-w-4xl gap-10 px-5 py-14 sm:grid-cols-2">
          {PRINCIPLES.map((x) => (
            <div key={x.t}>
              <h2 className="text-lg font-bold">{x.t}</h2>
              <p className="mt-2 text-ink-muted">{x.b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-5 py-14">
        <Link href={localePath(locale, "/contact")} className="inline-flex h-12 items-center rounded-md bg-brand px-5 text-lg font-semibold text-on-brand">
          Book a 20-minute call
        </Link>
      </section>
    </>
  );
}
