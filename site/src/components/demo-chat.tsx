"use client";

import { RotateCcw, Send } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { OFFERED_TIMES, SUGGESTIONS, book, greeting, reply, type DemoFacts, type DemoReply } from "@/lib/demo-engine";

type Turn = { id: number; from: "you" | "assistant" | "note"; text: string; times?: string[] };

// The try-it demo: tap a suggestion or type, a typing indicator shows, the scripted assistant answers from
// the demo clinic's real config, offers two times, and books the one you pick (the slot fills in marigold).
// Everything runs in the browser. CSS-only motion (.chat-in, .typing-dot, .slot-fill), off under reduced motion.
export function DemoChat({ facts }: { facts: DemoFacts }) {
  const start = (): Turn[] => [{ id: 0, from: "assistant", text: greeting(facts) }];
  const [turns, setTurns] = useState<Turn[]>(start);
  const [typing, setTyping] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const nextId = useRef(1);
  const log = useRef<HTMLDivElement>(null);
  const inputId = useId();

  // Keep the newest message in view inside the chat, without scrolling the page.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, typing]);

  function respond(you: string, answer: DemoReply) {
    setTurns((t) => [...t, { id: nextId.current++, from: "you", text: you }]);
    setTyping(true);
    const delay = Math.min(1400, 500 + answer.text.length * 6);
    window.setTimeout(() => {
      setTyping(false);
      setTurns((t) => [
        ...t,
        { id: nextId.current++, from: "assistant", text: answer.text, times: answer.times },
        ...(answer.handedOver ? [{ id: nextId.current++, from: "note" as const, text: "Handed to the team, with a summary" }] : []),
      ]);
      if (answer.booked) setBooked(answer.booked);
    }, delay);
  }

  function ask(text: string) {
    const clean = text.trim().slice(0, 200);
    if (!clean || typing) return;
    setAsked((a) => [...a, clean]);
    respond(clean, reply(clean, facts));
  }

  function pick(time: string) {
    if (typing) return;
    respond(time, book(time, facts));
  }

  function restart() {
    setTurns(start());
    setTyping(false);
    setBooked(null);
    setAsked([]);
    setDraft("");
  }

  const lastOffer = [...turns].reverse().find((t) => t.from === "assistant")?.times;
  const suggestions = SUGGESTIONS.filter((s) => !asked.includes(s));

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="font-display flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand font-bold">H</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{facts.clinic}</span>
            <span className="block text-sm text-ink-muted">Fictional demo clinic</span>
          </span>
        </div>
        <button type="button" onClick={restart} className="flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-muted hover:bg-brand-soft hover:text-ink">
          <RotateCcw size={16} aria-hidden="true" /> Start over
        </button>
      </div>

      <div ref={log} role="log" aria-live="polite" aria-label="Demo conversation" className="h-[22rem] overflow-y-auto overscroll-contain px-4 py-4">
      <ol className="space-y-2.5">
        {turns.map((t) =>
          t.from === "note" ? (
            <li key={t.id} className="chat-in text-center text-sm text-ink-muted">{t.text}</li>
          ) : (
            <li key={t.id} className={`chat-in flex ${t.from === "you" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${t.from === "you" ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-brand-soft"}`}>
                <span className="sr-only">{t.from === "you" ? "You: " : `${facts.assistant}: `}</span>
                {t.text}
              </p>
            </li>
          ),
        )}
        {typing && (
          <li className="flex justify-start" aria-label={`${facts.assistant} is typing`}>
            <span className="flex gap-1 rounded-2xl rounded-bl-md bg-brand-soft px-4 py-3" aria-hidden="true">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </li>
        )}
      </ol>
      </div>

      <div className="border-t border-rule px-4 pt-3 pb-4">
        {(lastOffer || booked) && (
          <div className="mb-3">
            <p className="text-sm text-ink-muted">Tomorrow with {facts.dentist}</p>
            <ul className="mt-1.5 grid grid-cols-4 gap-2 text-center text-sm font-semibold">
              {["7:30am", ...OFFERED_TIMES, "10:45am"].map((slot) => {
                const offered = !booked && lastOffer?.includes(slot);
                const isBooked = booked === slot;
                return (
                  <li key={slot}>
                    {offered ? (
                      <button type="button" onClick={() => pick(slot)} disabled={typing}
                        className="tabular h-11 w-full rounded-md border-2 border-brand bg-surface text-brand hover:bg-brand-soft disabled:opacity-60">
                        {slot}
                      </button>
                    ) : (
                      <span className={`tabular flex h-11 items-center justify-center rounded-md border ${isBooked ? "slot-fill border-highlight bg-highlight text-on-highlight" : "border-rule text-ink-muted"}`}>
                        {isBooked ? `${slot} booked` : slot}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={typing}
                className="min-h-10 rounded-full border border-rule px-3.5 py-1.5 text-sm font-semibold hover:border-brand hover:bg-brand-soft disabled:opacity-60">
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(draft); setDraft(""); }} className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">Your message to the demo assistant</label>
          <input id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} autoComplete="off"
            placeholder="Or type a question" className="h-11 min-w-0 flex-1 rounded-md border border-rule bg-paper px-3 placeholder:text-ink-muted" />
          <button type="submit" disabled={typing || !draft.trim()} className="flex h-11 items-center gap-1.5 rounded-md bg-brand px-4 font-semibold text-on-brand disabled:opacity-60">
            <Send size={16} aria-hidden="true" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
