import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoSection } from "@/components/demo";
import { Faq, faqJsonLd } from "@/components/faq";
import { JsonLd } from "@/components/json-ld";
import { LOCALE_INFO, LOCALES, alternates, localePath, type Locale } from "@/content/locales";
import { packageBySlug, usd } from "@/content/packages";
import { VERTICALS, verticalBySlug } from "@/content/verticals";

type Props = { params: Promise<{ locale: Locale; vertical: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => VERTICALS.map((v) => ({ locale, vertical: v.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, vertical } = await params;
  const v = verticalBySlug(vertical);
  if (!v) return {};
  return { title: v.title(locale), description: v.description(locale), alternates: alternates(locale, `/for/${v.slug}`) };
}

export default async function VerticalPage({ params }: Props) {
  const { locale, vertical } = await params;
  const v = verticalBySlug(vertical);
  if (!v) notFound();
  const info = LOCALE_INFO[locale];
  const path = (to: string) => localePath(locale, to);
  const packages = v.packages.map((s) => packageBySlug(s)!);
  const clinical = v.slug === "dental" || v.slug === "physio";
  const faq = [
    ...v.faq,
    { q: "Is it compliant with messaging rules?", a: `Marketing messages follow ${info.messagingLaw}: they only go to people who've agreed, and STOP, UNSUBSCRIBE and similar replies are honoured on every channel straight away.` },
    ...(clinical ? [{ q: `Does it know about ${info.healthCover}?`, a: `It answers from your own policies, so it says exactly what you tell it about ${info.healthCover}, and nothing else.` }] : []),
  ];

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-14 sm:pt-16">
        <p className="font-semibold text-eucalyptus">{v.name}</p>
        <h1 className="display mt-3 max-w-3xl text-4xl sm:text-5xl">{v.headline}</h1>
        <p className="mt-5 max-w-2xl text-xl text-ink-muted">{v.lede}</p>
        <Link href={path("/contact")} className="mt-8 inline-flex h-12 items-center rounded-md bg-eucalyptus px-5 text-lg font-semibold text-on-eucalyptus">Book a 20-minute call</Link>
      </section>

      <section className="border-y border-rule bg-surface" aria-labelledby="moments">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 id="moments" className="display text-3xl">The moments it handles</h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {v.moments.map((m) => (
              <div key={m.title}>
                <h3 className="text-lg font-bold">{m.title}</h3>
                <p className="mt-2 text-ink-muted">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="fit">
        <h2 id="fit" className="display text-3xl">Recommended for {v.name.toLowerCase()}</h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {packages.map((p, i) => (
            <li key={p.slug} className={`rounded-xl p-6 ${i === 0 ? "border-2 border-eucalyptus" : "border border-rule"}`}>
              <p className="text-sm font-semibold text-ink-muted">{i === 0 ? "Start with" : "Add when you're ready"}</p>
              <h3 className="mt-1 text-xl font-bold">{p.name}</h3>
              <p className="tabular mt-1 text-2xl font-bold">{usd(p.price)}</p>
              <p className="mt-2 text-ink-muted">{p.summary}</p>
              <Link href={path(`/packages/${p.slug}`)} className="mt-4 inline-flex h-11 items-center font-semibold text-eucalyptus underline-offset-4 hover:underline">What&apos;s included</Link>
            </li>
          ))}
        </ul>
        {clinical && <p className="mt-6 text-ink-muted">Works with {info.practiceSystems}.</p>}
      </section>

      {clinical && <DemoSection />}
      <Faq items={faq} />
      <JsonLd data={faqJsonLd(faq)} />
    </>
  );
}
