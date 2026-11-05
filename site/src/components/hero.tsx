import Link from "next/link";
import { HeroVideo } from "./hero-video";

const TURNS = [
  { from: "patient", text: "Hi, is there anything tomorrow morning? Tooth's been bugging me", at: "9:47 pm" },
  { from: "ava", text: "Sorry to hear that. Dr Chen has 8:15 or 9:30 tomorrow. Which suits?", at: "9:47 pm" },
  { from: "patient", text: "8:15 please", at: "9:48 pm" },
  { from: "ava", text: "Booked: tomorrow at 8:15 with Dr Chen. See you then.", at: "9:48 pm" },
] as const;
const SLOTS = ["7:30", "8:15", "9:30", "10:45"];

// The site's one orchestrated moment, in CSS only (no JavaScript): messages arrive in turn, then the
// 8:15 slot fills. With reduced motion everything renders in its final state. The transcript is also
// the poster for a looping hero video when one is added (NEXT_PUBLIC_HERO_VIDEO).
export function Hero({ headline, lede, ctaHref, pricingHref }: { headline: string; lede: string; ctaHref: string; pricingHref: string }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-16 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24">
      <div>
        <h1 className="display text-4xl sm:text-5xl">{headline}</h1>
        <p className="mt-6 max-w-xl text-lg text-ink-muted sm:text-xl">{lede}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={ctaHref} className="flex h-12 items-center rounded-md bg-brand px-5 text-lg font-semibold text-on-brand">Book a 20-minute call</Link>
          <Link href={pricingHref} className="flex h-12 items-center rounded-md px-4 text-lg font-semibold text-ink underline-offset-4 hover:underline">See pricing</Link>
        </div>
        <p className="mt-4 text-sm text-ink-muted">Fixed price. Live in 14 days. Cancel the care plan any time after 3 months.</p>
      </div>

      <HeroVideo>
        <figure className="after-hours rounded-2xl p-4 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--night)_65%,transparent)] sm:p-6" aria-label="Example: a patient books at 9:47 pm by WhatsApp">
          <p className="flex items-center justify-between text-sm text-ink-muted">
            <span className="font-semibold text-ink">Harbourside Dental</span>
            <span>Clinic closed, assistant on</span>
          </p>
          <ol className="mt-4 space-y-2.5">
            {TURNS.map((t, i) => (
              <li key={i} className={`arrive flex ${t.from === "ava" ? "justify-end" : "justify-start"}`} style={{ animationDelay: `${250 + i * 520}ms` }}>
                <p className={`max-w-[85%] rounded-xl px-3.5 py-2 ${t.from === "ava" ? "bg-brand-soft" : "bg-surface"}`}>
                  {t.text}
                  <span className="mt-0.5 block text-right text-xs text-ink-muted">{t.at}</span>
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-5 border-t border-rule pt-4">
            <p className="text-sm text-ink-muted">Tomorrow, Dr Chen</p>
            <ul className="mt-2 grid grid-cols-4 gap-2 text-center text-sm font-semibold">
              {SLOTS.map((s) => (
                <li key={s} className={`tabular rounded-md border border-rule py-2 ${s === "8:15" ? "fill-slot" : "text-ink-muted"}`} style={s === "8:15" ? { animationDelay: "2450ms" } : undefined}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="sr-only">A patient messages at 9:47 pm, the assistant offers two times and books 8:15 tomorrow with Dr Chen.</figcaption>
        </figure>
      </HeroVideo>
    </section>
  );
}
