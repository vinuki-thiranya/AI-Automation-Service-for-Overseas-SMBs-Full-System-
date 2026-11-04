import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { isConfigured } from "@/lib/env";
import { safeNext } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="after-hours hidden flex-col justify-between bg-paper p-12 text-ink lg:flex" aria-hidden="true">
        <Wordmark />
        <div className="max-w-md">
          <p className="text-[2.4rem] font-bold leading-[1.15] tracking-[-0.02em]">The front desk closed at six. The messages didn&apos;t stop.</p>
          <p className="mt-4 text-lg text-ink-muted">Everything your assistant answered, booked and passed to your team is in here.</p>
        </div>
        <p className="text-sm text-ink-muted">Nuvadesk client dashboard</p>
      </section>
      <section className="flex flex-col justify-center px-5 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-[-0.01em]">Sign in</h1>
          <p className="mt-2 mb-8 text-ink-muted">Use the email address your clinic is set up with.</p>
          {params.error === "link" && (
            <p role="alert" className="mb-6 rounded-md bg-signal-wash p-3 text-sm text-ink">
              That sign-in link has expired or was already used. Ask for a new one below.
            </p>
          )}
          {params.signed_out && <p role="status" className="mb-6 text-sm text-ink-muted">You&apos;re signed out.</p>}
          {isConfigured
            ? <LoginForm next={safeNext(params.next)} />
            : <p role="alert" className="rounded-md bg-signal-wash p-3 text-sm">Supabase isn&apos;t configured: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart.</p>}
        </div>
      </section>
    </main>
  );
}
