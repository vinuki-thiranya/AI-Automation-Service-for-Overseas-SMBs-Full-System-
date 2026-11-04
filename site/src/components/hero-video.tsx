import type { ReactNode } from "react";

// Spec Prompt 5: "lazy-loaded looping video, reduced-motion poster fallback". Until a video exists
// (NEXT_PUBLIC_HERO_VIDEO, e.g. /hero.mp4 in site/public), the animated transcript is the hero.
// With a video: it loads only after the page (preload="none"), and is hidden under reduced motion,
// where the transcript (the poster) shows instead.
export function HeroVideo({ children }: { children: ReactNode }) {
  const src = process.env.NEXT_PUBLIC_HERO_VIDEO;
  if (!src) return <>{children}</>;
  return (
    <div className="relative">
      <div className="motion-safe:hidden">{children}</div>
      <video
        className="hidden aspect-[4/5] w-full rounded-2xl object-cover motion-safe:block"
        src={src} autoPlay muted loop playsInline preload="none" aria-hidden="true"
      />
    </div>
  );
}
