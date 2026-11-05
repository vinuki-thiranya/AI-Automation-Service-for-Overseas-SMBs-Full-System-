// The "Night bubble" logo (design-system/nuvadesk/logo.svg) in theme colours, so it follows light and
// after-hours (dark): a chat bubble with a crescent moon, and the marigold reply dot.
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d="M9 3.5h14a6.5 6.5 0 0 1 6.5 6.5v8a6.5 6.5 0 0 1-6.5 6.5H13l-6.2 4.6a.8.8 0 0 1-1.3-.7l.7-4.2A6.5 6.5 0 0 1 2.5 18v-8A6.5 6.5 0 0 1 9 3.5z" fill="var(--brand)" />
      <path d="M17.6 8.2a6 6 0 1 0 4.9 9.3 5 5 0 1 1-4.9-9.3z" fill="var(--on-brand)" />
      <circle cx="24.2" cy="9.4" r="2.6" fill="var(--highlight)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display inline-flex items-center gap-2 text-xl font-bold tracking-[-0.025em] ${className}`}>
      <LogoMark />
      Nuvadesk
    </span>
  );
}
