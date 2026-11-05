import { MessageCircle } from "lucide-react";
import { getDemoFacts } from "@/content/demo-clinic";
import { DemoChat } from "./demo-chat";

// Spec Prompt 5: "a live demo WhatsApp number section". The public demo number is a paid Meta/Twilio
// number, deferred while we build on free tiers (PLAN §9). Until NEXT_PUBLIC_DEMO_WHATSAPP is set, visitors
// try a scripted preview in the page instead, built from the demo clinic's real price list and policies.
// With the number set, the WhatsApp button appears next to it.
export function DemoSection() {
  const number = process.env.NEXT_PUBLIC_DEMO_WHATSAPP;
  return (
    <section className="after-hours" aria-labelledby="demo">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <h2 id="demo" className="display text-3xl sm:text-4xl">Ask our demo clinic something.</h2>
          <p className="mt-4 max-w-lg text-lg text-ink-muted">
            Harbourside Dental is our fictional demo clinic. Ask about prices, opening hours or parking, or book a time.
          </p>
          <p className="mt-3 max-w-lg text-ink-muted">
            This preview is scripted from the clinic&apos;s own price list and policies, so it runs in your browser. The real assistant follows the same rules: it never guesses a price, offers real free times from the calendar, and hands anything unusual to a person.
          </p>
          {number && (
            <a href={`https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, do you have anything on Saturday?")}`}
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-brand px-5 text-lg font-semibold text-on-brand">
              <MessageCircle size={20} aria-hidden="true" /> Message the real demo on WhatsApp
            </a>
          )}
        </div>
        <DemoChat facts={getDemoFacts()} />
      </div>
    </section>
  );
}
