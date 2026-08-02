export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Hero skeleton */}
      <div className="shimmer h-[320px] w-full rounded-2xl bg-surface" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="shimmer aspect-video w-full rounded-lg bg-surface" />
            <div className="shimmer h-3 w-3/4 rounded bg-surface" />
            <div className="shimmer h-3 w-1/3 rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
