import type { Metadata } from "next";
import Link from "next/link";
import { alternates, localePath, type Locale } from "@/content/locales";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Case study: an AI front desk for a dental clinic",
    description: "How the Nuvadesk AI front desk is set up for a dental clinic: channels, booking rules, hand-offs and reporting, shown on our demo clinic.",
    alternates: alternates(locale, "/case-studies"),
  };
}

const BUILD = [
  { day: "Days 1–2", what: "Discovery and scope", detail: "Opening hours, services and prices, cancellation policy, health funds, which questions staff answer most, and who should get hand-offs." },
  { day: "Days 3–6", what: "Channels and calendar", detail: "WhatsApp Business number, SMS number with missed-call forwarding, website chat widget, and two dentists' Google calendars with a 15-minute buffer." },
  { day: "Days 7–10", what: "The assistant", detail: "Price list and policies loaded, new-patient exams limited to before 4pm, after-hours wording with emergency directions, and a staff hand-off to the practice manager." },
  { day: "Days 11–14", what: "Testing and go-live", detail: "50 test conversations including injection attempts, clinical questions and fake prices; staff training; walkthrough video; go-live." },
];

// No real client results yet: this page documents the demo build honestly and has room for real
// case studies (with numbers and the client's permission) as they come.
export default async function CaseStudies({ params }: Props) {
  const { locale } = await params;
  const p = (path: string) => localePath(locale, path);
  return (
    <>
      <section className="mx-auto max-w-4xl px-5 pt-12 pb-10 sm:pt-16">
        <p className="font-semibold text-eucalyptus">Demo build</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">Harbourside Dental: how a clinic&apos;s front desk is set up</h1>
        <p className="mt-5 text-xl text-ink-muted">
          Harbourside Dental is a fictional two-dentist clinic in Sydney that we run the full system on. This page shows exactly what we build
          for a clinic. Results from real clients will appear here, with their numbers and their permission, as they go live.
        </p>
      </section>

      <section className="border-y border-rule bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl font-bold">The brief</h2>
          <p className="mt-3 text-lg text-ink-muted">
            Calls ring out while both dentists and the practice manager are with patients. Messages that arrive after 6pm wait until morning.
            The same five questions (parking, prices, health funds, Saturday hours, Afterpay) take up the front desk&apos;s day.
          </p>
          <h2 className="mt-10 text-2xl font-bold">The 14-day build</h2>
          <ol className="mt-5 space-y-6">
            {BUILD.map((b) => (
              <li key={b.day} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-6">
                <p className="tabular font-bold text-eucalyptus">{b.day}</p>
                <div>
                  <h3 className="text-lg font-bold">{b.what}</h3>
                  <p className="mt-1 text-ink-muted">{b.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-bold">What the clinic sees each week</h2>
        <p className="mt-3 text-lg text-ink-muted">
          A dashboard and a Monday-morning email with enquiries handled, bookings made, leads by score, reply times, conversations handed to staff, and
          an estimate of revenue from bookings. Every conversation is searchable for 12 months.
        </p>
        <Link href={p("/contact")} className="mt-8 inline-flex h-12 items-center rounded-md bg-eucalyptus px-5 text-lg font-semibold text-on-eucalyptus">
          Book a 20-minute call
        </Link>
      </section>
    </>
  );
}
