"use client";

import { Info as InfoIcon } from "lucide-react";
import { useId, type CSSProperties } from "react";

// "What is this?" for a figure: a native popover (opens on click, tap or Enter; Esc or a click elsewhere
// closes it), anchored under its button where the browser supports CSS anchor positioning.
export function Info({ label, children }: { label: string; children: string }) {
  const id = useId();
  const anchor = `--info-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <>
      <button type="button" popoverTarget={id} aria-label={`What is ${label.toLowerCase()}?`}
        style={{ anchorName: anchor } as CSSProperties}
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-ink-muted align-middle hover:bg-brand-soft hover:text-ink">
        <InfoIcon size={15} aria-hidden="true" />
      </button>
      <div id={id} popover="auto" role="tooltip"
        style={{ positionAnchor: anchor, top: "anchor(bottom)", left: "anchor(left)", positionTryFallbacks: "flip-inline" } as CSSProperties}
        className="info-pop m-0 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-rule bg-surface p-3 text-sm leading-relaxed text-ink shadow-lg">
        <p className="font-semibold">{label}</p>
        <p className="mt-1 text-ink-muted">{children}</p>
      </div>
    </>
  );
}
