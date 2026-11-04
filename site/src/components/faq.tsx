import { ChevronDown } from "lucide-react";

// Native <details>: keyboard and screen-reader friendly, and no JavaScript on the page.
export function Faq({ items, heading = "Questions clinics ask" }: { items: { q: string; a: string }[]; heading?: string }) {
  return (
    <section aria-labelledby="faq" className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <h2 id="faq" className="text-2xl font-bold tracking-[-0.01em]">{heading}</h2>
      <div className="mt-6 divide-y divide-rule border-y border-rule">
        {items.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown size={20} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="pb-4 text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export const faqJsonLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
