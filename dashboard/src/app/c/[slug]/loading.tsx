// Skeleton shaped like the overview: the summary line, the figures row and two panels.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-12 w-80 max-w-full rounded-lg bg-rule/60" />
      <div className="mt-8 h-8 w-[36rem] max-w-full rounded bg-rule/60" />
      <div className="mt-8 grid grid-cols-2 gap-4 border-y border-rule py-5 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 rounded bg-rule/50" />)}
      </div>
      <div className="mt-8 h-72 rounded-lg bg-rule/40" />
    </div>
  );
}
