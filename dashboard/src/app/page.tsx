import { redirect } from "next/navigation";
import { getMemberships, isAgency } from "@/lib/data";

// Agency staff land on the cross-client view; clinic users go straight to their clinic.
export default async function Home() {
  if (await isAgency()) redirect("/agency");
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect(`/c/${memberships[0]!.slug}`);
  return (
    <main className="mx-auto max-w-lg px-5 py-24">
      <h1 className="font-display text-2xl font-bold">Your account isn&apos;t linked to a clinic yet</h1>
      <p className="mt-3 text-ink-muted">
        You&apos;re signed in, but nobody has given this email access to a clinic. Ask your Nuvadesk contact to add you, then sign in again.
      </p>
      <form action="/auth/signout" method="post" className="mt-8">
        <button className="h-11 cursor-pointer rounded-md border border-rule px-4 font-semibold">Sign out</button>
      </form>
    </main>
  );
}
