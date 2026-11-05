import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Transcript } from "@/components/transcript";
import { getMembership } from "@/lib/data";

export const metadata: Metadata = { title: "Conversation" };

export default async function Thread({ params }: { params: Promise<{ slug: string; threadId: string }> }) {
  const { slug, threadId } = await params;
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const transcript = await Transcript({ membership, threadId });
  if (!transcript) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/c/${slug}/conversations`} className="mb-2 inline-flex h-11 items-center gap-2 font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={18} aria-hidden="true" /> All conversations
      </Link>
      {transcript}
    </div>
  );
}
