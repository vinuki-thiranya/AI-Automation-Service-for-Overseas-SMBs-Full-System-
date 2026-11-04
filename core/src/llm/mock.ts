// Deterministic stand-ins for the models, used by unit tests and `npm run qa` (mock mode).
// The mock conversation model is a small rule engine over the same tools and TurnContext the real
// model gets, so QA exercises the real plumbing: tool validation, booking, escalation, compliance.
import type {
  ChatTurn, Classifier, ConversationModel, ConversationRequest, ConversationResult, Embedder,
  GuardrailCategory, ToolCallRecord, TurnContext, UsageEntry,
} from "./types.ts";

const ZERO: UsageEntry = {
  provider: "mock", model: "mock", kind: "chat", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
};

const INJECTION = /(ignore (all |any )?(previous|prior|your|the above) (instructions|rules|prompt)|system prompt|developer mode|you are now|pretend (to be|you are)|reveal (your|the) (prompt|instructions)|jailbreak|disregard (your|all) (rules|instructions)|act as (an?|my) (?!patient))/i;
const ABUSE = /\b(fuck\w*|shit\w*|bitch|idiot|stupid (bot|machine)|useless (bot|piece)|moron|dumb (bot|ai)|go to hell)\b/i;
const EMERGENCY = /(emergency|severe|unbearable|excruciating|swollen|swelling|abscess|knocked out|broken (tooth|teeth)|cracked tooth|bleeding (won'?t|wont|doesn'?t) stop|can'?t sleep|really bad pain|extreme pain|terrible pain|face is swollen)/i;
const WANTS_HUMAN = /(speak|talk|chat) (to|with) (a |an |the )?(human|person|real person|someone|staff|receptionist|manager|dentist)|real person|human please|call me back|ring me|not a bot|stop the bot/i;
const OUT_OF_SCOPE = /(weather|bitcoin|crypto|stock tips|write (me )?(a|an) (poem|essay|story|program|code)|homework|recipe|football|cricket score|election|capital of)/i;
const SPANISH = /\b(hola|gracias|cita|quiero|necesito|dentista|buenos d[ií]as|por favor)\b/i;
const HINDI = /[ऀ-ॿ]/;

export class MockClassifier implements Classifier {
  async guardrail(input: { text: string }) {
    const t = input.text;
    const category: GuardrailCategory =
      INJECTION.test(t) ? "prompt_injection" :
      ABUSE.test(t) ? "abuse" :
      WANTS_HUMAN.test(t) ? "wants_human" :
      EMERGENCY.test(t) ? "emergency" :
      OUT_OF_SCOPE.test(t) ? "out_of_scope" : "ok";
    const language = HINDI.test(t) ? "hi" : SPANISH.test(t) ? "es" : "en";
    return { verdict: { category, confidence: 0.9, language, reason: "mock rules" }, usage: [{ ...ZERO, kind: "classifier" as const }] };
  }

  async mapChoice(input: { options: string[]; reply: string }) {
    const r = input.reply.trim().toLowerCase();
    const byIndex = /^\d+$/.test(r) ? input.options[Number(r) - 1] : undefined;
    const byText = input.options.find((o) => r.includes(o.toLowerCase()) || o.toLowerCase().includes(r))
      ?? input.options.find((o) => o.toLowerCase().split(/\W+/).some((w) => w.length > 3 && r.includes(w)));
    return { option: byIndex ?? byText ?? null, usage: [] };
  }

  async judgeLead(input: { answers: Record<string, string> }) {
    const text = Object.values(input.answers).join(" ").toLowerCase();
    const score = /this month|asap|invisalign|yes/.test(text) ? 8 : /browsing|not sure|no/.test(text) ? 2 : 5;
    return { score, usage: [] };
  }

  async summarize(input: { previousSummary: string | null; turns: ChatTurn[] }) {
    const last = input.turns.filter((t) => t.role === "user").map((t) => t.text).join(" / ");
    return { summary: `${input.previousSummary ? `${input.previousSummary} ` : ""}${last}`.slice(-600), usage: [] };
  }
}

const SERVICE_KEYWORDS: [RegExp, string][] = [
  [/invisalign|aligner|straighten/i, "invisalign"],
  [/whiten/i, "whitening"],
  [/emergency|pain|toothache|broken|cracked|swollen/i, "emergency"],
  [/new patient|first (visit|time)|never been/i, "new-patient"],
  [/clean|check[- ]?up|checkup|scale/i, "check-up"],
];

function guessService(text: string, ctx: TurnContext): string | null {
  for (const [re, key] of SERVICE_KEYWORDS) {
    if (re.test(text)) {
      const svc = ctx.services.find((s) => s.id.includes(key));
      if (svc) return svc.id;
    }
  }
  return null;
}

type Step = { tool: string; input: Record<string, unknown> } | { reply: string };

/** Rule-based conversation model: plans at most two tool calls, then writes a reply from the results. */
export class MockConversation implements ConversationModel {
  readonly provider = "mock" as const;
  readonly model = "mock-receptionist";

  async run(req: ConversationRequest): Promise<ConversationResult> {
    const ctx = req.context;
    const last = req.history.at(-1)?.text ?? "";
    const t = last.toLowerCase();
    const toolCalls: ToolCallRecord[] = [];
    const call = async (name: string, input: Record<string, unknown>) => {
      const out = await req.executeTool(name, input);
      toolCalls.push({ name, input, output: out.content, isError: !!out.isError });
      return { ...out, json: JSON.parse(out.content) as Record<string, unknown> };
    };
    const done = (text: string): ConversationResult => ({
      text, provider: "mock", model: this.model, stopReason: "end_turn", refused: false, toolCalls, usage: [ZERO],
    });
    const listSlots = (slots: { label: string }[]) => slots.slice(0, 3).map((s, i) => `${i + 1}) ${s.label}`).join("\n");

    // 1. Choosing one of the slots offered earlier.
    if (ctx.offeredSlots.length && /(first|earliest|second|third|that one|book it|book me in|yes|sounds good|works for me|\b[123]\b|\d{1,2}(:\d{2})?\s*(am|pm))/i.test(t)) {
      const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
      let slot = /second|\b2\b/.test(t) ? ctx.offeredSlots[1] : /third|\b3\b/.test(t) ? ctx.offeredSlots[2] : ctx.offeredSlots[0];
      const day = t.match(/\b(mon|tue|wed|thu|fri|sat|sun)/)?.[1];
      const pool = day ? ctx.offeredSlots.filter((s) => s.label.toLowerCase().startsWith(day)) : ctx.offeredSlots;
      if (day && pool[0]) slot = pool[0];
      if (timeMatch) {
        const wanted = `${Number(timeMatch[1])}${timeMatch[2] && timeMatch[2] !== "00" ? `:${timeMatch[2]}` : ""}${timeMatch[3]}`;
        slot = pool.find((s) => s.label.toLowerCase().replace(":00", "").includes(wanted)) ?? slot;
      }
      if (slot) {
        const nameMatch = last.match(/(?:\b[Ii]'?m|\b[Mm]y name is|\b[Nn]ame'?s|\b[Ii]t'?s)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
        const name = nameMatch?.[1] ?? ctx.contactName;
        if (!name) return done("Great choice. Can I get your full name for the booking?");
        const res = await call("book_appointment", {
          slot_id: slot.slot_id, patient_name: name, is_new_patient: ctx.isNewContact || /new/.test(t),
        });
        if (res.isError) return done("Sorry, that time was just taken. Want me to look for another one?");
        return done(`You're booked in for ${String(res.json.when ?? slot.label)}. We'll send a reminder the day before.`);
      }
    }

    // 2. Cancel / reschedule an existing booking.
    if (/cancel/.test(t) && ctx.upcomingBookings.length) {
      const b = ctx.upcomingBookings[0]!;
      const confirmLate = /\b(yes|confirm|that'?s fine|ok|okay)\b/.test(t);
      const res = await call("cancel", { booking_id: b.booking_id, confirm_late_cancellation: confirmLate });
      if (res.json.requires_confirmation) return done(String(res.json.message ?? "That's inside our cancellation window. Do you still want to cancel?"));
      if (res.isError) return done("I couldn't cancel that booking. I'll ask the team to help.");
      return done(`Done. Your ${b.label} appointment is cancelled.`);
    }
    if (/(reschedul|move my|change my (appointment|booking)|different time)/.test(t) && ctx.upcomingBookings.length) {
      const b = ctx.upcomingBookings[0]!;
      const res = await call("check_availability", { service_id: b.service_id ?? ctx.services[0]?.id });
      const slots = (res.json.slots as { label: string }[] | undefined) ?? [];
      return done(slots.length ? `Sure. I can move it to:\n${listSlots(slots)}\nWhich suits?` : "I couldn't find another time soon. I'll ask the team to call you.");
    }

    // 3. Emergency.
    if (ctx.emergency) {
      if (ctx.afterHours) return done("I'm sorry you're in pain. We're closed right now. I'll make sure the team sees this first thing.");
      const res = await call("check_availability", { service_id: ctx.services.find((s) => s.id.includes("emergency"))?.id ?? ctx.services[0]?.id });
      const slots = (res.json.slots as { label: string }[] | undefined) ?? [];
      return done(slots.length ? `I'm sorry you're in pain. The next emergency appointments are:\n${listSlots(slots)}\nShall I book one?` : "I'm sorry you're in pain. Let me get the team to call you straight away.");
    }

    // 4. Clinical advice is out of bounds.
    if (/(should i take|what (medication|medicine|antibiotic)|is it normal|diagnos|do i need a root canal|is (this|it) infected)/.test(t)) {
      return done("I can't give medical advice over chat, but a dentist can check it properly. Would you like me to find you an appointment?");
    }

    // 5. Complaints go to a person; greetings get a greeting.
    if (/(unhappy|not happy|complain|refund|disappointed|terrible (service|experience)|rude)/.test(t)) {
      await call("escalate_to_human", { reason: "complaint", summary: `Complaint: ${last.slice(0, 200)}` });
      return done("I'm sorry to hear that. I've passed this to the team and someone will get back to you shortly.");
    }
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b[\s!.,]*(there)?[\s!.,?]*$/.test(t)) return done("Hi! How can I help you today?");

    // 6. Prices (before booking intent: "how much is a check-up?" is a price question).
    if (/(price|cost|how much|fee|charge)/.test(t)) {
      const svc = ctx.services.find((s) => guessService(t, ctx) === s.id);
      if (svc) return done(svc.price ? `A ${svc.name.toLowerCase()} is ${svc.price}.` : `For ${svc.name.toLowerCase()}, the team will confirm the price at your visit.`);
      return done(`Here are our main prices:\n${ctx.services.filter((s) => s.price).map((s) => `- ${s.name}: ${s.price}`).join("\n")}`);
    }

    // 7. Booking intent.
    if (/(book|appointment|availab|come in|get in|see (a |the )?dentist|check-?up|clean|consult|\bslots?\b|openings)/.test(t)) {
      if (ctx.bookingMode === "link") {
        const res = await call("check_availability", { service_id: ctx.services[0]?.id });
        return done(`You can pick a time here: ${String(res.json.booking_link ?? "")}`);
      }
      const service = guessService(t, ctx) ?? (ctx.isNewContact ? ctx.services.find((s) => s.id.includes("new-patient"))?.id : null) ?? ctx.services[0]?.id;
      const partOfDay = /morning/.test(t) ? "morning" : /afternoon/.test(t) ? "afternoon" : /evening|after work/.test(t) ? "evening" : undefined;
      const res = await call("check_availability", { service_id: service, ...(partOfDay ? { part_of_day: partOfDay } : {}) });
      const slots = (res.json.slots as { label: string }[] | undefined) ?? [];
      if (res.isError || slots.length === 0) return done("I couldn't find a free time in the next couple of weeks. I'll ask the team to call you.");
      return done(`Here are the next available times:\n${listSlots(slots)}\nWhich would you like?`);
    }

    // 8. Hours, location, parking, forms.
    if (/(open|hours|close|closing|weekend|saturday|sunday)/.test(t)) return done(`Our hours: ${ctx.hoursSummary}.`);
    if (/(park)/.test(t) && ctx.parking) return done(ctx.parking);
    if (/(where are you|address|located|location|directions)/.test(t)) {
      const doc = ctx.documents.find((d) => /direction/i.test(d.id));
      if (doc) await call("send_document", { document_id: doc.id });
      return done(`We're at ${ctx.address}.${doc ? " I've sent you directions." : ""}`);
    }
    if (/(form|paperwork)/.test(t) && ctx.documents.length) {
      const doc = ctx.documents.find((d) => /form/i.test(d.id)) ?? ctx.documents[0]!;
      await call("send_document", { document_id: doc.id });
      return done(`I've sent you the ${doc.name.toLowerCase()}.`);
    }

    // 9. Interest without a booking request → lead qualification.
    if (/(interested in|thinking about|considering|enquir|info(rmation)? (on|about))/.test(t)) {
      const res = await call("create_lead", { interest: last.slice(0, 200) });
      if (!res.isError && res.json.first_question) return done(String(res.json.first_question));
    }

    // 10. Grounded FAQ answer, else hand over.
    const top = ctx.faq[0];
    if (top && top.similarity > 0.25) {   // bag-of-words cosine: two shared keywords ≈ 0.28
      const answer = top.content.split("\n").filter((l) => l && !l.startsWith("#")).join(" ");
      return done(answer.slice(0, 400));
    }
    await call("escalate_to_human", { reason: "low_confidence", summary: `Customer asked: ${last.slice(0, 200)}` });
    return done("Good question. I'll check with the team and someone will get back to you shortly.");
  }
}

/** Bag-of-words hashing embedder: good enough for keyword-overlap retrieval in tests. */
export class MockEmbedder implements Embedder {
  readonly model = "mock-embed";
  private readonly dims: number;
  constructor(dims = 256) {
    this.dims = dims;
  }
  async embed(texts: string[]) {
    const vectors = texts.map((text) => {
      const v = new Array<number>(this.dims).fill(0);
      for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
        let h = 2166136261;
        for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
        v[Math.abs(h) % this.dims]! += 1;
      }
      return v;
    });
    return { vectors, usage: [] };
  }
}
