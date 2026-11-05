"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// First-visit help, stored in this browser only (a clinic's front-desk computer is often shared, so "once
// per device" is the right unit; nothing here needs to reach the server):
//   - Tour: four short steps over the real page. Skip any time; Back and Next; replay from Help (?tour=1).
//   - Getting started: a checklist that ticks itself as people use the dashboard (TrackStep marks a step).

export type StepId = "walkthrough" | "conversation" | "search" | "approvals" | "billing";
const key = (slug: string, what: string) => `nuvadesk:${slug}:${what}`;
const STEP_EVENT = "nuvadesk:step";

function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* private mode: the help just shows again next time */ }
}
function doneSteps(slug: string): StepId[] {
  try { return JSON.parse(read(key(slug, "steps")) ?? "[]") as StepId[]; } catch { return []; }
}

/** Marks a getting-started step as done when the page that completes it is shown. Renders nothing. */
export function TrackStep({ slug, step }: { slug: string; step: StepId }) {
  useEffect(() => {
    const done = doneSteps(slug);
    if (done.includes(step)) return;
    write(key(slug, "steps"), JSON.stringify([...done, step]));
    window.dispatchEvent(new Event(STEP_EVENT));
  }, [slug, step]);
  return null;
}

const TOUR = [
  { target: "nav", title: "Everything in one place", body: "Switch clinic at the top, then move between the overview, conversations and help. A number appears when something needs you." },
  { target: "summary", title: "Your week in one sentence", body: "How many patients the assistant answered and booked, and how many came in while the clinic was closed. Change the period above it." },
  { target: "heatmap", title: "When patients get in touch", body: "Each square is an hour of the week; your opening hours are outlined. Click a square to read those conversations." },
  { target: "conversations", title: "Read any conversation", body: "Every message is searchable for 12 months. Open one to see what the assistant said and when your team took over." },
];

export function Tour({ slug }: { slug: string }) {
  const params = useSearchParams();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; place: "below" | "above" } | null>(null);

  useEffect(() => {
    if (params.get("tour") === "1" || !read(key(slug, "tour"))) setStep(0);
  }, [params, slug]);

  const finish = useCallback(() => {
    write(key(slug, "tour"), "done");
    document.querySelector(".tour-target")?.classList.remove("tour-target");
    setStep(null);
  }, [slug]);

  // Point at the step's element (skipping any that isn't visible, e.g. the menu on a phone).
  useLayoutEffect(() => {
    if (step === null) return;
    const visible = (el: Element | null) => el && (el as HTMLElement).offsetParent !== null;
    let s = step;
    let el = document.querySelector(`[data-tour="${TOUR[s]!.target}"]`);
    while (s < TOUR.length && !visible(el)) {
      s++;
      el = s < TOUR.length ? document.querySelector(`[data-tour="${TOUR[s]!.target}"]`) : null;
    }
    if (s >= TOUR.length || !el) { finish(); return; }
    if (s !== step) { setStep(s); return; }
    document.querySelector(".tour-target")?.classList.remove("tour-target");
    el.classList.add("tour-target");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const place = () => {
      const r = el.getBoundingClientRect();
      const below = r.bottom + 220 < window.innerHeight;
      const left = Math.max(16, Math.min(r.left, window.innerWidth - 16 - Math.min(360, window.innerWidth - 32)));
      setBox({ top: below ? r.bottom + 12 : Math.max(16, r.top - 12), left, place: below ? "below" : "above" });
    };
    place();
    const t = window.setTimeout(place, reduce ? 0 : 350);   // after the smooth scroll settles
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [step, finish]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null || !box) return null;
  const s = TOUR[step]!;
  const last = step === TOUR.length - 1;
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body"
      className="tour-card fixed z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border border-rule bg-surface p-4 shadow-2xl"
      style={{ top: box.top, left: box.left, transform: box.place === "above" ? "translateY(-100%)" : undefined }}>
      <div className="flex items-start justify-between gap-3">
        <p className="tabular text-sm font-semibold text-brand">Step {step + 1} of {TOUR.length}</p>
        <button type="button" onClick={finish} aria-label="Skip the tour" className="-m-1 flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-brand-soft hover:text-ink">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <h2 id="tour-title" className="font-display mt-1 text-lg font-bold">{s.title}</h2>
      <p id="tour-body" className="mt-1 text-ink-muted">{s.body}</p>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={finish} className="mr-auto h-10 cursor-pointer px-1 text-sm font-semibold text-ink-muted hover:text-ink">Skip tour</button>
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="h-10 cursor-pointer rounded-md border border-rule px-3 font-semibold hover:bg-brand-soft">Back</button>}
        <button type="button" autoFocus onClick={() => (last ? finish() : setStep(step + 1))} className="h-10 cursor-pointer rounded-md bg-brand px-4 font-semibold text-on-brand">
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

export function GettingStarted({ slug, steps }: { slug: string; steps: { id: StepId; label: string; href: string }[] }) {
  const [done, setDone] = useState<StepId[] | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const sync = () => { setDone(doneSteps(slug)); setHidden(read(key(slug, "checklist")) === "hidden"); };
    sync();
    window.addEventListener(STEP_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(STEP_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [slug]);

  if (!done || hidden) return null;
  const count = steps.filter((s) => done.includes(s.id)).length;
  if (count === steps.length) return null;
  const hide = () => { write(key(slug, "checklist"), "hidden"); setHidden(true); };

  return (
    <section aria-labelledby="getting-started" className="mt-6 rounded-xl border border-rule bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="getting-started" className="font-display text-lg font-bold">Getting started</h2>
        <p className="tabular text-sm text-ink-muted">{count} of {steps.length} done</p>
        <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-brand-soft" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(count / steps.length) * 100}%` }} />
        </div>
        <button type="button" onClick={hide} className="h-9 cursor-pointer text-sm font-semibold text-ink-muted hover:text-ink">Hide this list</button>
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const ok = done.includes(s.id);
          return (
            <li key={s.id}>
              <Link href={s.href} className={`flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-brand-soft ${ok ? "text-ink-muted" : "font-semibold"}`}>
                <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${ok ? "border-highlight bg-highlight text-on-highlight" : "border-rule"}`}>
                  {ok && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={ok ? "line-through decoration-ink-muted/50" : ""}>{s.label}</span>
                <span className="sr-only">{ok ? "(done)" : "(not done yet)"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
