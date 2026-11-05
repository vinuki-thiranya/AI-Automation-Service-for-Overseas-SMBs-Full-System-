import { notFound } from "next/navigation";
import { Drawer } from "@/components/drawer";
import { Transcript } from "@/components/transcript";
import { getMembership } from "@/lib/data";

export default async function ThreadPreview({ params }: { params: Promise<{ slug: string; threadId: string }> }) {
  const { slug, threadId } = await params;
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const transcript = await Transcript({ membership, threadId, titleId: "drawer-title" });
  if (!transcript) notFound();
  return <Drawer titleId="drawer-title" fullHref={`/c/${slug}/conversations/${threadId}`}>{transcript}</Drawer>;
}
