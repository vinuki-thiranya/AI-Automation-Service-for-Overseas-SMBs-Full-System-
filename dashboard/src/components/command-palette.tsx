"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const OPEN_EVENT = "nuvadesk:command-palette";

/** The visible way in, for people who don't use shortcuts. The menu can be mounted twice (rail and mobile
 *  sheet), so this only sends an event; the one CommandPalette owns the dialog and the key listeners. */
export function PaletteTrigger() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-md border border-rule bg-surface px-3 text-ink-muted hover:border-brand hover:text-ink">
      <Search size={18} aria-hidden="true" />
      <span className="flex-1 truncate text-left">Search</span>
      <kbd className="hidden rounded border border-rule px-1.5 text-xs font-semibold sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

type Item = { id: string; label: string; hint: string; href: string };

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Search or jump to a page"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close a panel, preview or menu"],
  ["J / K", "Approvals: next or previous draft"],
  ["A / E / R", "Approvals: approve, edit or reject"],
  ["Ctrl Enter", "Approvals: approve while editing a reply"],
];

// Ctrl+K (Cmd+K on a Mac) or the button in the menu: type to jump to a page or clinic, or press Enter to
// search conversations. "?" lists the keyboard shortcuts. Both are dialogs that keep and return focus.
export function CommandPalette({ pages, clinics, searchHref }: { pages: { label: string; href: string }[]; clinics: { name: string; href: string }[]; searchHref?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<"palette" | "help" | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const ids = useId();
  const [mac, setMac] = useState(false);   // set after hydration, so server and first client render match
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Item[] = [
      ...pages.map((p) => ({ id: `p-${p.href}`, label: p.label, hint: "Page", href: p.href })),
      ...clinics.map((c) => ({ id: `c-${c.href}`, label: c.name, hint: "Clinic", href: c.href })),
    ];
    const matches = q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all;
    return q && searchHref ? [{ id: "search", label: `Search conversations for “${query.trim()}”`, hint: "Search", href: `${searchHref}?q=${encodeURIComponent(query.trim())}` }, ...matches] : matches;
  }, [pages, clinics, query, searchHref]);

  function show(mode: "palette" | "help") {
    opener.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(mode);
  }
  function close() {
    setOpen(null);
    window.setTimeout(() => opener.current?.focus?.(), 0);
  }
  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(null);
    router.push(item.href);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close(); else show("palette");
        return;
      }
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]");
      if (!typing && e.key === "?" && !open) {
        e.preventDefault();
        show("help");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (open === "palette") input.current?.focus();
  }, [open]);

  // The menu's "Search or jump to" button (PaletteTrigger) opens it too.
  useEffect(() => {
    const onOpen = () => show("palette");
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  });

  return (
    <>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="drawer-backdrop absolute inset-0 cursor-default bg-night/40" />
          {open === "palette" ? (
            <div role="dialog" aria-modal="true" aria-label="Search or jump to" className="palette relative w-full max-w-lg overflow-hidden rounded-xl border border-rule bg-surface shadow-2xl">
              <div className="flex items-center gap-3 border-b border-rule px-4">
                <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                <input
                  ref={input} value={query} role="combobox" aria-expanded="true" aria-controls={`${ids}-list`} aria-autocomplete="list"
                  aria-activedescendant={items[active] ? `${ids}-${items[active]!.id}` : undefined} aria-label="Search or jump to"
                  placeholder="Type a page, a clinic, or words to search conversations"
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
                    else if (e.key === "Tab") e.preventDefault();
                  }}
                  className="h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-ink-muted focus-visible:outline-none"
                />
              </div>
              <ul id={`${ids}-list`} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
                {items.length === 0 && <li className="px-3 py-6 text-center text-ink-muted">Nothing matches. Try another word{searchHref ? ", or open a clinic to search its conversations" : ""}.</li>}
                {items.map((item, i) => (
                  <li key={item.id} id={`${ids}-${item.id}`} role="option" aria-selected={i === active}
                    onMouseMove={() => setActive(i)} onClick={() => go(item)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 ${i === active ? "bg-brand-soft" : ""}`}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                    <span className="text-sm text-ink-muted">{item.hint}</span>
                    {i === active && <CornerDownLeft size={16} className="text-ink-muted" aria-hidden="true" />}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div role="dialog" aria-modal="true" aria-labelledby={`${ids}-help`} className="palette relative w-full max-w-md rounded-xl border border-rule bg-surface p-5 shadow-2xl">
              <h2 id={`${ids}-help`} className="font-display text-xl font-bold">Keyboard shortcuts</h2>
              <dl className="mt-4 divide-y divide-rule">
                {SHORTCUTS.map(([keys, what]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-ink-muted">{what}</dt>
                    <dd><kbd className="rounded border border-rule bg-paper px-2 py-0.5 text-sm font-semibold">{mac ? keys.replace("Ctrl", "⌘") : keys}</kbd></dd>
                  </div>
                ))}
              </dl>
              <button type="button" autoFocus onClick={close} className="mt-5 h-11 w-full cursor-pointer rounded-md bg-brand font-semibold text-on-brand">Close</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
