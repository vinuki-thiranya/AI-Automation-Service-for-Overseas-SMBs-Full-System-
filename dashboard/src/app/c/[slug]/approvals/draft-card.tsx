"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type Ref } from "react";
import type { Draft } from "@/lib/data";

type Mode = "view" | "edit" | "reject";
export type CardCommand = { id: string; type: "approve" | "edit" | "reject"; nonce: number };
type Decision = { action: "approve" | "reject"; body?: string; note?: string; edited: boolean };

// One draft in the approval queue. The queue (approval-queue.tsx) owns sending: this card reports the
// decision, then shows it as waiting (with Undo in the toast) until it's sent.
export function DraftCard({ ref, draft, received, active, onFocusCard, queued, error, command, onDecide }: {
  ref?: Ref<HTMLElement>;
  draft: Draft;
  received: string;
  active: boolean;
  onFocusCard: () => void;
  queued?: "approve" | "reject";
  error?: string;
  command: CardCommand | null;
  onDecide: (d: Decision) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [body, setBody] = useState(draft.draft_body);
  const [note, setNote] = useState("");
  const reduce = useReducedMotion();
  const ids = useId();
  const edited = body !== draft.draft_body;

  function approve() {
    if (!body.trim()) return;
    onDecide({ action: "approve", body: edited ? body : undefined, edited });
  }

  // Keyboard shortcuts arrive from the queue as commands.
  useEffect(() => {
    if (!command) return;
    if (command.type === "approve") approve();
    else if (command.type === "edit") {
      setMode("edit");
      window.setTimeout(() => document.getElementById(`${ids}-body`)?.focus(), 0);
    } else {
      setMode("reject");
      window.setTimeout(() => document.getElementById(`${ids}-note`)?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per command
  }, [command?.nonce]);

  // After Undo, the card comes back exactly as it was.
  useEffect(() => {
    if (!queued) setMode((m) => (m === "reject" ? "view" : m));
  }, [queued]);

  return (
    <motion.article
      ref={ref}
      layout={!reduce}
      tabIndex={-1}
      onFocus={onFocusCard}
      aria-labelledby={`${ids}-subject`}
      aria-busy={queued ? true : undefined}
      className={`rounded-lg border bg-surface p-4 outline-none transition-[opacity,box-shadow] sm:p-5 ${queued ? "border-rule opacity-60" : "border-rule"} ${active ? "ring-2 ring-brand/50" : ""}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${ids}-subject`} className="font-bold">{draft.subject ?? "No subject"}</h2>
        <p className="text-sm text-ink-muted">
          {draft.customer_name ?? "Customer"}, ticket {draft.external_ticket_id}, {received}
        </p>
        {draft.confidence !== null && (
          <p className={`ml-auto text-sm ${draft.confidence < 0.75 ? "font-semibold text-signal" : "text-ink-muted"}`}>
            {draft.confidence < 0.75 ? "Check carefully: " : ""}{Math.round(draft.confidence * 100)}% confident
          </p>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold text-ink-muted">They wrote</h3>
          <p className="mt-1 whitespace-pre-wrap">{draft.customer_message}</p>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-ink-muted">
            {mode === "edit" && !queued ? <label htmlFor={`${ids}-body`}>Your reply (edit before approving)</label> : "Drafted reply"}
          </h3>
          {mode === "edit" && !queued ? (
            <textarea id={`${ids}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={6}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) approve(); }}
              className="mt-1 w-full rounded-md border border-rule bg-paper p-3 leading-relaxed" />
          ) : (
            <p className="mt-1 rounded-md bg-brand-soft p-3 whitespace-pre-wrap">{body}</p>
          )}
        </section>
      </div>

      {mode === "reject" && !queued && (
        <div className="mt-4">
          <label htmlFor={`${ids}-note`} className="text-sm font-semibold">Why are you rejecting it? (optional, helps us improve the drafts)</label>
          <input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onDecide({ action: "reject", note: note || undefined, edited: false }); } }}
            className="mt-1 h-11 w-full rounded-md border border-rule bg-paper px-3" placeholder="e.g. Handled by phone instead" />
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {error && <p role="alert" className="mr-auto text-sm font-semibold text-danger">{error}</p>}
        {queued ? (
          <p className="mr-auto text-sm font-semibold text-ink-muted">{queued === "approve" ? "Approving" : "Rejecting"} in a moment. Use Undo to cancel.</p>
        ) : mode !== "reject" ? (
          <>
            {mode === "view"
              ? <button type="button" onClick={() => setMode("edit")} className="h-11 cursor-pointer rounded-md border border-rule px-4 font-semibold hover:bg-brand-soft/50">Edit</button>
              : <button type="button" onClick={() => { setBody(draft.draft_body); setMode("view"); }} className="h-11 cursor-pointer rounded-md px-4 font-semibold text-ink-muted hover:text-ink">Undo edits</button>}
            <button type="button" onClick={() => setMode("reject")} className="h-11 cursor-pointer rounded-md border border-rule px-4 font-semibold hover:bg-brand-soft/50">Reject</button>
            <button type="button" disabled={!body.trim()} onClick={approve}
              className="h-11 cursor-pointer rounded-md bg-brand px-4 font-semibold text-on-brand disabled:cursor-not-allowed disabled:opacity-70">
              {mode === "edit" ? "Approve edited reply" : "Approve"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setMode("view")} className="h-11 cursor-pointer rounded-md px-4 font-semibold text-ink-muted hover:text-ink">Keep the draft</button>
            <button type="button" onClick={() => onDecide({ action: "reject", note: note || undefined, edited: false })}
              className="h-11 cursor-pointer rounded-md border border-danger px-4 font-semibold text-danger">
              Reject draft
            </button>
          </>
        )}
      </footer>
    </motion.article>
  );
}
