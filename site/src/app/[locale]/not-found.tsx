import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-24">
      <h1 className="display text-4xl">This page doesn&apos;t exist</h1>
      <p className="mt-4 text-lg text-ink-muted">The link may be old, or the address mistyped.</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-md bg-eucalyptus px-5 font-semibold text-on-eucalyptus">Go to the home page</Link>
    </section>
  );
}
