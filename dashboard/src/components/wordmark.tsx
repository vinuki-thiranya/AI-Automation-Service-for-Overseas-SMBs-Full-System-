export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-bold tracking-[-0.01em] ${className}`}>
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--eucalyptus)" />
        <path d="M9 22V10h2.6l6.2 8.1V10H20v12h-2.5L11.3 13.9V22z" fill="var(--on-eucalyptus)" />
        <circle cx="24" cy="10" r="2.4" fill="var(--dusk)" />
      </svg>
      Nuvadesk
    </span>
  );
}
