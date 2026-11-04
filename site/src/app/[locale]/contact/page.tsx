import type { Metadata } from "next";
import { CalEmbed } from "@/components/cal-embed";
import { contactEmail } from "@/components/footer";
import { alternates, type Locale } from "@/content/locales";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Book a 20-minute call",
    description: "Book a 20-minute call to see whether an AI front desk is worth it for your clinic. No slides, just your enquiries and an honest answer.",
    alternates: alternates(locale, "/contact"),
  };
}

export default async function Contact({ params }: Props) {
  await params;
  const cal = process.env.NEXT_PUBLIC_CAL_LINK;
  const email = contactEmail();
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-5 pt-12 pb-20 sm:pt-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <h1 className="display text-4xl sm:text-5xl">Book a 20-minute call</h1>
        <p className="mt-5 text-xl text-ink-muted">We&apos;ll look at how enquiries reach your clinic today, where they&apos;re lost, and tell you honestly whether this is worth it.</p>
        <ul className="mt-8 space-y-3 text-lg">
          <li className="flex gap-3"><span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-eucalyptus" />No slides, no obligation.</li>
          <li className="flex gap-3"><span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-eucalyptus" />If it&apos;s a fit, you get a one-page scope and a fixed price.</li>
          <li className="flex gap-3"><span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-eucalyptus" />Prefer email? Write to <a href={`mailto:${email}`} className="font-semibold text-eucalyptus underline underline-offset-4">{email}</a>.</li>
        </ul>
      </div>
      <div>
        {cal ? <CalEmbed link={cal} /> : (
          <div className="rounded-xl border border-rule bg-surface p-8">
            <h2 className="text-2xl font-bold">Email us to pick a time</h2>
            <p className="mt-3 text-ink-muted">Tell us your clinic&apos;s name and the best times for you, and we&apos;ll reply with a time that suits.</p>
            <a href={`mailto:${email}?subject=${encodeURIComponent("20-minute call")}`} className="mt-6 inline-flex h-12 items-center rounded-md bg-eucalyptus px-5 text-lg font-semibold text-on-eucalyptus">
              Email {email}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
