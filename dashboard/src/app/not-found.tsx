import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-5 py-24">
      <h1 className="font-display text-2xl font-bold">Nothing here</h1>
      <p className="mt-3 text-ink-muted">This page doesn&apos;t exist, or your account doesn&apos;t have access to it.</p>
      <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-md bg-brand px-4 font-semibold text-on-brand">Go to your dashboard</Link>
    </main>
  );
}
