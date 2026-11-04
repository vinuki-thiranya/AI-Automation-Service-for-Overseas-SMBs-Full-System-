import { MessageCircle } from "lucide-react";

const SAMPLE = [
  { from: "you", text: "Do you take new patients on Saturdays?" },
  { from: "ava", text: "Hi, I'm Ava, Harbourside Dental's virtual assistant. Yes, Saturdays 9am to 1pm. A new patient exam with x-rays is 60 minutes and $280. Want me to find you a time?" },
  { from: "you", text: "How much is whitening?" },
  { from: "ava", text: "The whitening consultation is free. The dentist gives you a written price at that visit. Shall I book one?" },
];

// Spec Prompt 5: "a live demo WhatsApp number section". The public demo number is a paid Meta/Twilio
// number, deferred while we build on free tiers (PLAN §9); until NEXT_PUBLIC_DEMO_WHATSAPP is set, this
// shows a labelled sample conversation from the demo clinic instead.
export function DemoSection() {
  const number = process.env.NEXT_PUBLIC_DEMO_WHATSAPP;
  return (
    <section className="after-hours" aria-labelledby="demo">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 id="demo" className="display text-3xl">{number ? "Message our demo clinic yourself." : "Here's how it talks to a patient."}</h2>
          <p className="mt-4 max-w-lg text-lg text-ink-muted">
            {number
              ? "Harbourside Dental is a fictional clinic running the real system. Ask about prices, parking or a Saturday appointment, any time of day."
              : "A sample conversation with Harbourside Dental, our fictional demo clinic. The assistant answers from the clinic's own price list and policies, never guesses a price, and hands anything unusual to a person."}
          </p>
          {number && (
            <a href={`https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, do you have anything on Saturday?")}`}
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-eucalyptus px-5 text-lg font-semibold text-on-eucalyptus">
              <MessageCircle size={20} aria-hidden="true" /> Message the demo on WhatsApp
            </a>
          )}
        </div>
        <figure className="rounded-2xl border border-rule bg-surface p-4 sm:p-6">
          <figcaption className="mb-4 text-sm text-ink-muted">Sample conversation with the demo clinic</figcaption>
          <ol className="space-y-2.5">
            {SAMPLE.map((m, i) => (
              <li key={i} className={`flex ${m.from === "ava" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] rounded-xl px-3.5 py-2 ${m.from === "ava" ? "bg-gumleaf" : "bg-paper"}`}>{m.text}</p>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}
