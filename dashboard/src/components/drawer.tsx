"use client";

import { Maximize2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// Quick preview of a conversation over the list (an intercepted route, so the URL is the thread's own and a
// reload or a shared link opens the full page). Esc, the close button or the backdrop go back to the list.
// Focus moves into the panel, stays there while it's open, and returns to the link that opened it.
export function Drawer({ children, titleId, fullHref }: { children: ReactNode; titleId: string; fullHref: string }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        router.back();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close preview" tabIndex={-1} onClick={() => router.back()} className="drawer-backdrop absolute inset-0 cursor-default bg-night/40" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="drawer-panel relative flex h-full w-full max-w-2xl flex-col border-l border-rule bg-paper shadow-[0_0_60px_-20px_color-mix(in_srgb,var(--night)_60%,transparent)] outline-none">
        <div className="flex items-center justify-end gap-1 border-b border-rule px-3 py-2">
          {/* A plain <a>, so this navigation isn't intercepted again: it opens the full page. */}
          <a href={fullHref} className="flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-muted hover:bg-brand-soft hover:text-ink">
            <Maximize2 size={16} aria-hidden="true" /> Open full page
          </a>
          <button type="button" onClick={() => router.back()} className="flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-muted hover:bg-brand-soft hover:text-ink">
            <X size={18} aria-hidden="true" /> Close <span className="sr-only">(Esc)</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
