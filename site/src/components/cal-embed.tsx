"use client";
import { useState } from "react";

// Cal.com loads only when the visitor asks for it: no third-party script or iframe on page load,
// which keeps the contact page fast and free of tracking until someone chooses to book.
export function CalEmbed({ link }: { link: string }) {
  const [open, setOpen] = useState(false);
  const src = `https://cal.com/${link.replace(/^\/+/, "")}?embed=true&theme=light`;
  if (!open) {
    return (
      <div className="rounded-xl border border-rule bg-surface p-8">
        <h2 className="font-display text-2xl font-bold">Pick a time</h2>
        <p className="mt-3 text-ink-muted">Opens our booking calendar (Cal.com) right here. Times show in your time zone.</p>
        <button type="button" onClick={() => setOpen(true)} className="mt-6 inline-flex h-12 cursor-pointer items-center rounded-md bg-brand px-5 text-lg font-semibold text-on-brand">
          Show available times
        </button>
      </div>
    );
  }
  return <iframe src={src} title="Book a 20-minute call (Cal.com)" className="h-[680px] w-full rounded-xl border border-rule bg-surface" />;
}
