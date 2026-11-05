// A scripted stand-in for the real assistant, for the site's try-it demo. It answers only from the demo
// clinic's own config and FAQ (DemoFacts), never invents a price, offers two times before booking, and
// hands anything it doesn't know to a person, which is how the real system behaves. No AI calls, no cost.

export interface DemoFacts {
  clinic: string;
  assistant: string;
  hours: { day: string; text: string }[];
  services: { name: string; minutes: number; price: number; note?: string }[];
  parking: string;
  address: string;
  cancellation: string;
  payment: string;
  insurance: string;
  dentist: string;
  manager: string;
  faq: { q: string; a: string }[];
}

export interface DemoReply {
  text: string;
  /** Times to offer as buttons; picking one books it. */
  times?: string[];
  /** Set when a slot was just booked: the UI fills it in marigold. */
  booked?: string;
  /** The conversation was handed to a person. */
  handedOver?: boolean;
}

export const SUGGESTIONS = ["Are you open Saturday?", "How much is a check-up?", "Book me in tomorrow", "Do you take my health fund?", "I've got a toothache"];
export const OFFERED_TIMES = ["8:15am", "9:30am"];

const has = (text: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(text));
const money = (n: number) => (n === 0 ? "free" : `$${n}`);
const faqAnswer = (facts: DemoFacts, question: RegExp) => facts.faq.find((f) => question.test(f.q))?.a;

export function greeting(facts: DemoFacts): string {
  return `Hi, I'm ${facts.assistant}, ${facts.clinic}'s virtual assistant. I can answer questions and book appointments. A person from the team can take over at any time.`;
}

function hours(facts: DemoFacts, text: string): string {
  const asked = facts.hours.find((h) => new RegExp(`\\b${h.day.slice(0, 3)}`, "i").test(text));
  if (asked) {
    return asked.text === "closed"
      ? `We're closed on ${asked.day}s. I can still book you in for another day: want me to find a time?`
      : `Yes, on ${asked.day}s we're open ${asked.text}. Want me to find you a time?`;
  }
  return `Our hours: ${facts.hours.map((h) => `${h.day} ${h.text}`).join("; ")}.`;
}

function price(facts: DemoFacts, text: string): string {
  const match = facts.services.find((s) => {
    const n = s.name.toLowerCase();
    return (has(text, "check", "clean") && n.includes("check-up"))
      || (has(text, "new patient", "x-ray", "xray") && n.includes("new patient"))
      || (has(text, "emergenc") && n.includes("emergency"))
      || (has(text, "whiten") && n.includes("whitening"))
      || (has(text, "invisalign", "aligner", "brace") && n.includes("invisalign"));
  });
  if (match) {
    const from = match.note === "from" ? "from " : "";
    const note = match.note && match.note !== "from" ? ` (${match.note})` : "";
    return `${match.name} is ${from}${money(match.price)}${note} and takes ${match.minutes} minutes. Shall I book one?`;
  }
  // Never guess a price: list what's on the price list instead.
  return `Here's our price list: ${facts.services.map((s) => `${s.name} ${s.note === "from" ? "from " : ""}${money(s.price)}`).join("; ")}. For anything else, the dentist gives you a written price at your visit.`;
}

export function reply(input: string, facts: DemoFacts): DemoReply {
  const text = input.trim();
  if (!text) return { text: "Ask me anything about the clinic, or tap one of the suggestions." };

  if (has(text, "person", "human", "staff", "someone", "call me", "speak")) {
    return { text: `Sure. I've passed this to ${facts.manager} with a summary of our chat, and they'll reply here during opening hours.`, handedOver: true };
  }
  if (has(text, "toothache", "pain", "hurt", "swell", "broke", "chipped", "emergenc", "bleed")) {
    const emergency = facts.services.find((s) => /emergency/i.test(s.name));
    return {
      text: `Sorry to hear that. Emergency appointments are ${emergency ? `from ${money(emergency.price)}` : "available"}. I can offer ${OFFERED_TIMES.join(" or ")} tomorrow with ${facts.dentist}. If it's severe or you have trouble breathing or swallowing, call 000.`,
      times: OFFERED_TIMES,
    };
  }
  if (has(text, "cancel", "reschedul", "move my", "change my")) return { text: `${facts.cancellation} Want me to move an appointment for you?` };
  if (has(text, "book", "appointment", "available", "tomorrow", "slot", "come in", "see the")) {
    return { text: `I can do ${OFFERED_TIMES.join(" or ")} tomorrow with ${facts.dentist}. Which suits you?`, times: OFFERED_TIMES };
  }
  if (has(text, "price", "cost", "how much", "fee", "charge")) return { text: price(facts, text) };
  if (has(text, "open", "hour", "close", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend", "late")) {
    return { text: hours(facts, text) };
  }
  if (has(text, "fund", "insur", "hicaps", "bulk", "medicare", "bupa", "medibank", "hcf", "nib")) {
    return { text: faqAnswer(facts, /health funds/i) ?? facts.insurance };
  }
  if (has(text, "park", "where", "address", "find you", "location", "direction")) {
    return { text: `We're at ${facts.address}. ${facts.parking}` };
  }
  if (has(text, "pay", "afterpay", "instal", "credit card", "eftpos")) return { text: facts.payment };
  if (has(text, "child", "kid", "son", "daughter")) return { text: faqAnswer(facts, /children/i) ?? "Yes, we see children." };
  if (has(text, "new patient", "new here", "first visit")) return { text: faqAnswer(facts, /new patients/i) ?? price(facts, "new patient") };
  if (has(text, "whiten", "invisalign", "check", "clean")) return { text: price(facts, text) };
  if (has(text, "hi", "hello", "hey", "thanks", "thank you")) return { text: "Happy to help. What can I do for you?" };

  return { text: `I'm not sure about that one, so I've passed it to ${facts.manager}, who'll reply here during opening hours. I won't guess.`, handedOver: true };
}

export function book(time: string, facts: DemoFacts): DemoReply {
  return { text: `Booked: tomorrow at ${time} with ${facts.dentist}. I'll text you a reminder the day before. Anything else?`, booked: time };
}
