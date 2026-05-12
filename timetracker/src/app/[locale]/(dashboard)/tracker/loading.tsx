import { Skeleton } from "@/components/ui/skeleton";

export default function TrackerLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="ml-auto h-7 w-24 max-sm:ml-0 max-sm:w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div>
        <Skeleton className="mb-2 h-4 w-32" />
        <div className="space-y-2 rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-border p-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
