"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/data";
import { decideDraft } from "./actions";
import { DraftCard, type CardCommand } from "./draft-card";

const UNDO_MS = 5000;

type Decision = { action: "approve" | "reject"; body?: string; note?: string; edited: boolean };
type Toast = { id: string; text: string; tone: "info" | "done" | "error"; undo?: () => void; until?: number };

// The approval queue: a decision waits 5 seconds before it's sent, with an Undo in the toast, so a slip of
// the finger costs nothing. Leaving for another page sends anything waiting straight away; closing the tab
// with a decision still waiting asks first. Keyboard: J / K next and previous draft, A approve, E edit,
// R reject (when focus isn't in a text field).
export function ApprovalQueue({ slug, drafts }: { slug: string; drafts: { draft: Draft; received: string }[] }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [queued, setQueued] = useState<Record<string, Decision>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [command, setCommand] = useState<CardCommand | null>(null);
  const timers = useRef(new Map<string, { timer: number; decision: Decision }>());
  const cards = useRef<(HTMLElement | null)[]>([]);

  const toast = useCallback((t: Toast, ttl = 4000) => {
    setToasts((all) => [...all.filter((x) => x.id !== t.id), t].slice(-3));
    if (!t.undo) window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id || x.undo)), ttl);
  }, []);

  const send = useCallback(async (draft: Draft, d: Decision) => {
    timers.current.delete(draft.id);
    setToasts((all) => all.filter((x) => x.id !== draft.id));
    const res = await decideDraft(slug, draft.id, d.action, d.body, d.note);
    setQueued((q) => { const { [draft.id]: _, ...rest } = q; return rest; });
    if (res.ok) {
      toast({ id: `${draft.id}-done`, tone: "done", text: `${res.status === "approved" ? (d.edited ? "Approved with your edits" : "Approved") : "Rejected"}: ${draft.subject ?? "draft"}` });
      router.refresh();
    } else {
      setErrors((e) => ({ ...e, [draft.id]: res.message }));
      toast({ id: `${draft.id}-error`, tone: "error", text: res.message }, 7000);
    }
  }, [router, slug, toast]);

  const decide = useCallback((draft: Draft, d: Decision) => {
    setErrors((e) => { const { [draft.id]: _, ...rest } = e; return rest; });
    setQueued((q) => ({ ...q, [draft.id]: d }));
    const timer = window.setTimeout(() => void send(draft, d), UNDO_MS);
    timers.current.set(draft.id, { timer, decision: d });
    const undo = () => {
      window.clearTimeout(timer);
      timers.current.delete(draft.id);
      setQueued((q) => { const { [draft.id]: _, ...rest } = q; return rest; });
      setToasts((all) => all.filter((x) => x.id !== draft.id));
      toast({ id: `${draft.id}-undone`, tone: "info", text: `Undone. "${draft.subject ?? "Draft"}" is back in the queue.` });
    };
    toast({ id: draft.id, tone: "info", text: `${d.action === "approve" ? (d.edited ? "Approving with your edits" : "Approving") : "Rejecting"}: ${draft.subject ?? "draft"}`, undo, until: Date.now() + UNDO_MS });
  }, [send, toast]);

  // Leaving for another page: send what's waiting now. Closing the tab: ask first.
  useEffect(() => {
    const pending = timers.current;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (pending.size) e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      for (const [id, { timer, decision }] of pending) {
        window.clearTimeout(timer);
        void decideDraft(slug, id, decision.action, decision.body, decision.note);
      }
      pending.clear();
    };
  }, [slug]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        e.preventDefault();
        setActive((i) => {
          const next = Math.max(0, Math.min(drafts.length - 1, i + (key === "j" ? 1 : -1)));
          cards.current[next]?.focus();
          cards.current[next]?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          return next;
        });
      } else if (key === "a" || key === "e" || key === "r") {
        const draft = drafts[active]?.draft;
        if (!draft || queued[draft.id]) return;
        e.preventDefault();
        setCommand({ id: draft.id, type: key === "a" ? "approve" : key === "e" ? "edit" : "reject", nonce: Date.now() });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, drafts, queued]);

  return (
    <>
      <p className="mt-2 hidden text-sm text-ink-muted md:block">
        Keyboard: <Kbd>J</Kbd> <Kbd>K</Kbd> to move between drafts, <Kbd>A</Kbd> approve, <Kbd>E</Kbd> edit, <Kbd>R</Kbd> reject. Every decision can be undone for 5 seconds.
      </p>
      <div className="mt-6 space-y-4">
        {drafts.map(({ draft, received }, i) => (
          <DraftCard
            key={draft.id}
            ref={(el) => { cards.current[i] = el; }}
            draft={draft}
            received={received}
            active={i === active}
            onFocusCard={() => setActive(i)}
            queued={queued[draft.id]?.action}
            error={errors[draft.id]}
            command={command?.id === draft.id ? command : null}
            onDecide={(d) => decide(draft, d)}
          />
        ))}
      </div>

      <ol aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <li key={t.id} className={`toast after-hours pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-lg bg-paper px-4 py-3 text-ink shadow-lg sm:w-auto ${t.tone === "error" ? "border-l-4 border-danger" : ""}`}>
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.undo && (
              <button type="button" onClick={t.undo} className="h-9 shrink-0 rounded-md bg-highlight px-3 font-semibold text-on-highlight">
                Undo
              </button>
            )}
            {t.until && <span aria-hidden="true" className="toast-timer absolute bottom-0 left-0 h-[3px] bg-highlight" style={{ animationDuration: `${UNDO_MS}ms` }} />}
          </li>
        ))}
      </ol>
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-rule bg-surface px-1.5 py-0.5 font-sans text-xs font-semibold text-ink">{children}</kbd>;
}
