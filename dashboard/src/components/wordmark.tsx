// The "N thread" logo (design-system/nuvadesk/logo.svg): a lowercase n drawn as one line that finishes in a
// marigold tick (message in, booked). Fixed brand colours in every theme, like the favicon; on dark
// backgrounds the tile picks up a light-teal edge (--brand) so it doesn't sink into the night colour.
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#0b5d6b" stroke="var(--brand)" strokeOpacity="0.6" strokeWidth="1" />
      <path d="M9.5 23.5v-8.2a6.5 6.5 0 0 1 13 0v3.2" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M18.6 21.2l3.6 3.4 5.6-7.4" fill="none" stroke="#f2b33d" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
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
