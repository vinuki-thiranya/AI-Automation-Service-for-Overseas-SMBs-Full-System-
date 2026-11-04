"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState, useTransition } from "react";
import type { Draft } from "@/lib/data";
import { decideDraft } from "./actions";

type Mode = "view" | "edit" | "reject";

export function DraftCard({ slug, draft, received }: { slug: string; draft: Draft; received: string }) {
  const [mode, setMode] = useState<Mode>("view");
  const [body, setBody] = useState(draft.draft_body);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const reduce = useReducedMotion();
  const ids = useId();

  function decide(action: "approve" | "reject") {
    start(async () => {
      const res = await decideDraft(slug, draft.id, action, action === "approve" && body !== draft.draft_body ? body : undefined, action === "reject" ? note : undefined);
      setResult(res.ok
        ? { tone: "done", text: res.status === "approved" ? (body !== draft.draft_body ? "Approved with your edits." : "Approved.") : "Rejected." }
        : { tone: "error", text: res.message });
    });
  }

  const decided = result?.tone === "done";
  return (
    <motion.article
        layout={!reduce}
        aria-labelledby={`${ids}-subject`}
        className={`rounded-lg border bg-surface p-4 sm:p-5 ${decided ? "border-rule opacity-70" : "border-rule"}`}
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
              {mode === "edit" ? <label htmlFor={`${ids}-body`}>Your reply (edit before approving)</label> : "Drafted reply"}
            </h3>
            {mode === "edit" ? (
              <textarea id={`${ids}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={6}
                className="mt-1 w-full rounded-md border border-rule bg-paper p-3 leading-relaxed" />
            ) : (
              <p className="mt-1 rounded-md bg-gumleaf p-3 whitespace-pre-wrap">{body}</p>
            )}
          </section>
        </div>

        {mode === "reject" && !decided && (
          <div className="mt-4">
            <label htmlFor={`${ids}-note`} className="text-sm font-semibold">Why are you rejecting it? (optional, helps us improve the drafts)</label>
            <input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-rule bg-paper px-3" placeholder="e.g. Handled by phone instead" />
          </div>
        )}

        <footer className="mt-4 flex flex-wrap items-center gap-2">
          {result && (
            <p role="status" className={`mr-auto text-sm font-semibold ${result.tone === "error" ? "text-danger" : "text-eucalyptus"}`}>{result.text}</p>
          )}
          {!decided && mode !== "reject" && (
            <>
              {mode === "view"
                ? <button type="button" onClick={() => setMode("edit")} className="h-11 cursor-pointer rounded-md border border-rule px-4 font-semibold hover:bg-gumleaf/50">Edit</button>
                : <button type="button" onClick={() => { setBody(draft.draft_body); setMode("view"); }} className="h-11 cursor-pointer rounded-md px-4 font-semibold text-ink-muted hover:text-ink">Undo edits</button>}
              <button type="button" onClick={() => setMode("reject")} className="h-11 cursor-pointer rounded-md border border-rule px-4 font-semibold hover:bg-gumleaf/50">Reject</button>
              <button type="button" disabled={pending || !body.trim()} onClick={() => decide("approve")}
                className="h-11 cursor-pointer rounded-md bg-eucalyptus px-4 font-semibold text-on-eucalyptus disabled:cursor-wait disabled:opacity-70">
                {pending ? "Approving…" : mode === "edit" ? "Approve edited reply" : "Approve"}
              </button>
            </>
          )}
          {!decided && mode === "reject" && (
            <>
              <button type="button" onClick={() => setMode("view")} className="h-11 cursor-pointer rounded-md px-4 font-semibold text-ink-muted hover:text-ink">Keep the draft</button>
              <button type="button" disabled={pending} onClick={() => decide("reject")}
                className="h-11 cursor-pointer rounded-md border border-danger px-4 font-semibold text-danger disabled:cursor-wait disabled:opacity-70">
                {pending ? "Rejecting…" : "Reject draft"}
              </button>
            </>
          )}
        </footer>
    </motion.article>
  );
}
