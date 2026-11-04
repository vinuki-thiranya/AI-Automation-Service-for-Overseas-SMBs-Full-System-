import { FileText, LifeBuoy, PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMembership, listResources } from "@/lib/data";

export const metadata: Metadata = { title: "Help" };

/** Embeddable player URL for Loom or YouTube links; anything else opens as a link. */
function embedUrl(url: string): string | null {
  const loom = url.match(/^https:\/\/www\.loom\.com\/share\/([a-f0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const yt = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  return null;
}

const ICON = { walkthrough_video: PlayCircle, quick_guide: FileText, support: LifeBuoy, other: FileText } as const;

export default async function Help({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const membership = await getMembership(slug);
  if (!membership) notFound();
  const resources = await listResources(membership.client_id);
  const video = resources.find((r) => r.kind === "walkthrough_video");
  const embed = video?.url ? embedUrl(video.url) : null;
  const rest = resources.filter((r) => r !== video);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-[-0.01em]">Help</h1>
      <p className="mt-1 text-ink-muted">How your front desk works, and who to ask when something looks wrong.</p>

      <section className="mt-8" aria-labelledby="walkthrough">
        <h2 id="walkthrough" className="font-bold">{video?.title ?? "Your system walkthrough"}</h2>
        {embed ? (
          <div className="mt-3 aspect-video overflow-hidden rounded-lg border border-rule bg-surface">
            <iframe src={embed} title={video!.title} className="h-full w-full" allow="fullscreen; picture-in-picture" loading="lazy" />
          </div>
        ) : video?.url ? (
          <a href={video.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 items-center gap-2 rounded-md bg-eucalyptus px-4 font-semibold text-on-eucalyptus">
            <PlayCircle size={18} aria-hidden="true" /> Watch the walkthrough
          </a>
        ) : (
          <div className="mt-3 flex aspect-video max-h-72 items-center justify-center rounded-lg border border-dashed border-rule bg-surface p-6 text-center">
            <p className="max-w-sm text-ink-muted">{video?.note ?? "We record a walkthrough of your setup at go-live. It will play here."}</p>
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {rest.map((r) => {
            const Icon = ICON[r.kind as keyof typeof ICON] ?? FileText;
            const external = r.url?.startsWith("https://");
            return (
              <li key={r.id} className="rounded-lg border border-rule bg-surface p-4">
                <p className="flex items-center gap-2 font-bold"><Icon size={18} className="text-eucalyptus" aria-hidden="true" />{r.title}</p>
                {r.note && <p className="mt-1 text-ink-muted">{r.note}</p>}
                {r.url && (
                  <a href={r.url} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="mt-3 inline-flex h-11 items-center font-semibold text-eucalyptus underline-offset-4 hover:underline">
                    {r.url.startsWith("mailto:") ? `Email ${r.url.slice(7)}` : r.url.startsWith("tel:") ? `Call ${r.url.slice(4)}` : `Open ${r.title.toLowerCase()}`}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
