"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-24">
      <h1 className="font-display text-2xl font-bold">This page couldn&apos;t load</h1>
      <p className="mt-3 text-ink-muted">
        The dashboard couldn&apos;t reach your data. Check your connection and try again. If it keeps happening, send us this reference: {error.digest ?? "no reference"}.
      </p>
      <button onClick={reset} className="mt-8 h-11 cursor-pointer rounded-md bg-brand px-4 font-semibold text-on-brand">Try again</button>
    </main>
  );
}
