// Route-level loading skeletons (review perf §9) — navigation shows structure
// immediately instead of feeling frozen while the server assembles data.

export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      <SkeletonBar className="h-7 w-56" />
      <SkeletonBar className="mt-2 h-4 w-80" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <SkeletonBar className="h-9 w-9 shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-1/3" />
                <SkeletonBar className="h-3 w-2/3" />
              </div>
              <SkeletonBar className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
