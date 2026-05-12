export default function CalendarLoading() {
  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden animate-pulse"
      style={{ height: "calc(100vh - 9rem)" }}
    >
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 shrink-0">
        <div className="h-7 w-24 rounded bg-muted" />
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="ml-auto h-7 w-24 rounded bg-muted" />
      </div>

      {/* Day-header skeleton */}
      <div className="flex shrink-0 border-b border-border">
        <div className="w-14 shrink-0" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center py-2 gap-1 border-l border-border/40"
          >
            <div className="h-2.5 w-6 rounded bg-muted" />
            <div className="h-6 w-6 rounded-full bg-muted" />
          </div>
        ))}
      </div>

      {/* Grid skeleton – just horizontal lines */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className="flex h-full">
          <div className="w-14 shrink-0" />
          <div className="flex-1 border-l border-border/40">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="border-t border-border/30"
                style={{ height: "64px" }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
