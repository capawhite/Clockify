"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  deleteTimeEntry,
  saveManualEntry,
  updateTimeEntry,
} from "@/app/[locale]/(dashboard)/tracker/actions";
import { EntryBlock, minuteOfDayInZone, minuteToY, TOTAL_HEIGHT, HOUR_HEIGHT } from "./entry-block";
import { EntryFormPopover } from "./entry-form-popover";
import type { CalendarEntry, PopoverState } from "./types";
import type { TrackerProject } from "@/components/tracker/tracker-view";

export type { CalendarEntry };

const MIN_DRAG_MINUTES = 15;
const SNAP_MINUTES = 15;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`
);
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function snapMinute(m: number): number {
  return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
}

function yToMinute(y: number): number {
  return snapMinute(Math.max(0, Math.min(1435, (y / TOTAL_HEIGHT) * 1440)));
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function formatHm(minutes: number): string {
  const m = Math.min(1439, Math.max(0, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type DragState = {
  colDate: string;
  startMin: number;
  currentMin: number;
};

export type CalendarViewProps = {
  userId: string;
  workspaceTimezone: string;
  weekStartsOn: 0 | 1;
  weekStart: string; // yyyy-MM-dd of the first day of the displayed week
  projects: TrackerProject[];
  entries: CalendarEntry[];
};

export function CalendarView({
  userId,
  workspaceTimezone,
  weekStart,
  projects,
  entries: initialEntries,
}: CalendarViewProps) {
  const router = useRouter();
  const t = useTranslations("calendar");
  const tErr = useTranslations("errors");
  const [, startTransition] = useTransition();

  const [view, setView] = useState<"week" | "day">("week");
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [localEntries, setLocalEntries] = useState<CalendarEntry[]>(initialEntries);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Sync from RSC when week changes
  useEffect(() => {
    setLocalEntries(initialEntries);
  }, [initialEntries]);

  // Scroll to 8 am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT * 7.5;
    }
  }, []);

  // Tick for current-time indicator
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscription (mirrors tracker-view.tsx pattern)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`calendar_time_entries:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          startTransition(() => router.refresh());
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const nowIso = useMemo(() => new Date(nowMs).toISOString(), [nowMs]);

  const todayYmd = useMemo(
    () => formatInTimeZone(new Date(nowMs), workspaceTimezone, "yyyy-MM-dd"),
    [nowMs, workspaceTimezone]
  );

  const nowMinuteOfDay = useMemo(
    () => minuteOfDayInZone(nowIso, workspaceTimezone),
    [nowIso, workspaceTimezone]
  );

  // 7 day strings for the displayed week
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToYmd(weekStart, i)),
    [weekStart]
  );

  const visibleDays =
    view === "week" ? weekDays : [weekDays[selectedDayIdx]];

  // Group entries by workspace-local day
  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const d of weekDays) map.set(d, []);
    for (const e of localEntries) {
      const dayStr = formatInTimeZone(
        new Date(e.started_at),
        workspaceTimezone,
        "yyyy-MM-dd"
      );
      if (map.has(dayStr)) map.get(dayStr)!.push(e);
    }
    return map;
  }, [localEntries, weekDays, workspaceTimezone]);

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "day") {
      const d = weekDays[selectedDayIdx];
      const [y, m, day] = d.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, day));
      return date.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
    const [fy, fm, fd] = weekDays[0].split("-").map(Number);
    const [ly, lm, ld] = weekDays[6].split("-").map(Number);
    const first = new Date(Date.UTC(fy, fm - 1, fd));
    const last = new Date(Date.UTC(ly, lm - 1, ld));
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(first)} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [weekDays, view, selectedDayIdx]);

  // Week navigation
  const navigate = useCallback(
    (dir: number) => {
      const newWeek = addDaysToYmd(weekStart, dir * 7);
      startTransition(() => router.push(`/calendar?week=${newWeek}`));
    },
    [weekStart, router]
  );

  const goToday = useCallback(() => {
    startTransition(() => router.push("/calendar"));
  }, [router]);

  // Drag-to-create
  const onColumnMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, colDate: string) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-entry-block]")) return;
      e.preventDefault();
      e.stopPropagation();

      const scrollContainer = scrollRef.current;
      if (!scrollContainer) return;

      const containerRect = scrollContainer.getBoundingClientRect();

      const getMin = (clientY: number) => {
        const relY =
          clientY -
          containerRect.top +
          (scrollRef.current?.scrollTop ?? 0);
        return yToMinute(relY);
      };

      const startMin = getMin(e.clientY);
      setDrag({ colDate, startMin, currentMin: startMin + MIN_DRAG_MINUTES });
      draggingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const raw = getMin(ev.clientY);
        setDrag({
          colDate,
          startMin,
          currentMin: Math.max(startMin + MIN_DRAG_MINUTES, raw),
        });
      };

      const onUp = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const raw = getMin(ev.clientY);
        const endMin = Math.max(startMin + MIN_DRAG_MINUTES, raw);
        setDrag(null);
        setPopover({ mode: "create", date: colDate, startMin, endMin });
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    []
  );

  // Mutation handlers
  const handleCreate = useCallback(
    async (data: {
      project_id: string;
      description: string;
      is_billable: boolean;
      started_at: string;
      ended_at: string;
    }) => {
      setPending(true);
      const res = await saveManualEntry(data);
      setPending(false);
      if (!res.ok) {
        toast.error(tErr(res.errorKey, res.values));
        return;
      }
      toast.success(t("entrySaved"));
      setPopover(null);
      startTransition(() => router.refresh());
    },
    [router, t, tErr]
  );

  const handleUpdate = useCallback(
    async (
      id: string,
      data: {
        project_id: string;
        description: string;
        is_billable: boolean;
        started_at: string;
        ended_at: string | null;
      }
    ) => {
      setPending(true);
      const res = await updateTimeEntry({ id, ...data });
      setPending(false);
      if (!res.ok) {
        toast.error(tErr(res.errorKey, res.values));
        return;
      }
      toast.success(t("entryUpdated"));
      setPopover(null);
      startTransition(() => router.refresh());
    },
    [router, t, tErr]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setPending(true);
      const res = await deleteTimeEntry(id);
      setPending(false);
      if (!res.ok) {
        toast.error(tErr(res.errorKey, res.values));
        return;
      }
      toast.success(t("entryDeleted"));
      setPopover(null);
      startTransition(() => router.refresh());
    },
    [router, t, tErr]
  );

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden"
      style={{ height: "calc(100vh - 9rem)" }}
      onClick={() => setPopover(null)}
    >
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-base"
            onClick={() => (view === "week" ? navigate(-1) : setSelectedDayIdx((i) => Math.max(0, i - 1)))}
            aria-label={t("prevAria")}
          >
            ‹
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={goToday}
          >
            {t("today")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-base"
            onClick={() => (view === "week" ? navigate(1) : setSelectedDayIdx((i) => Math.min(6, i + 1)))}
            aria-label={t("nextAria")}
          >
            ›
          </Button>
        </div>

        <span className="flex-1 text-sm font-medium px-1 truncate">
          {headerLabel}
        </span>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setView("week")}
          >
            {t("weekView")}
          </Button>
          <Button
            type="button"
            variant={view === "day" ? "default" : "outline"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setView("day")}
          >
            {t("dayView")}
          </Button>
        </div>
      </div>

      {/* ── Day-header row ── */}
      <div
        className="flex shrink-0 border-b border-border bg-muted/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spacer for the hour-label column */}
        <div className="w-14 shrink-0" />
        {visibleDays.map((day, i) => {
          const [y, m, d] = day.split("-").map(Number);
          const utcDate = new Date(Date.UTC(y, m - 1, d));
          const isToday = day === todayYmd;
          return (
            <div
              key={day}
              className={cn(
                "flex-1 flex flex-col items-center py-2 text-xs border-l border-border/40 cursor-pointer select-none",
                isToday ? "text-primary" : "text-muted-foreground"
              )}
              onClick={() => {
                setSelectedDayIdx(i);
                setView("day");
              }}
            >
              <span className="uppercase tracking-wide text-[10px]">
                {DAY_ABBR[utcDate.getUTCDay()]}
              </span>
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                  isToday && "bg-primary text-primary-foreground"
                )}
              >
                {d}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Scrollable grid ── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex relative" style={{ height: TOTAL_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-14 shrink-0 relative pointer-events-none select-none">
            {HOUR_LABELS.map((label, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] text-muted-foreground"
                style={{ top: minuteToY(i * 60) - 7 }}
              >
                {i > 0 ? label : ""}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {visibleDays.map((day) => {
            const dayEntries = entriesByDay.get(day) ?? [];
            const isToday = day === todayYmd;

            return (
              <div
                key={day}
                className="flex-1 relative border-l border-border/40 cursor-crosshair overflow-hidden"
                onMouseDown={(e) => onColumnMouseDown(e, day)}
              >
                {/* Full-hour lines */}
                {HOUR_LABELS.map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-full border-t border-border/40 pointer-events-none"
                    style={{ top: minuteToY(i * 60) }}
                  />
                ))}
                {/* Half-hour dashed lines */}
                {HOUR_LABELS.map((_, i) => (
                  <div
                    key={`hh-${i}`}
                    className="absolute w-full border-t border-border/20 border-dashed pointer-events-none"
                    style={{ top: minuteToY(i * 60 + 30) }}
                  />
                ))}

                {/* Current-time indicator */}
                {isToday && (
                  <div
                    className="absolute w-full z-20 flex items-center pointer-events-none"
                    style={{ top: minuteToY(nowMinuteOfDay) }}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 -ml-[5px]" />
                    <div className="h-px flex-1 bg-red-500" />
                  </div>
                )}

                {/* Drag ghost */}
                {drag?.colDate === day && (
                  <div
                    className="absolute inset-x-0.5 z-30 rounded bg-primary/20 border border-primary/50 pointer-events-none flex items-start px-1.5 py-1"
                    style={{
                      top: minuteToY(drag.startMin),
                      height: Math.max(
                        minuteToY(MIN_DRAG_MINUTES),
                        minuteToY(drag.currentMin - drag.startMin)
                      ),
                    }}
                  >
                    <span className="text-[10px] text-primary font-medium leading-none">
                      {formatHm(drag.startMin)} – {formatHm(drag.currentMin)}
                    </span>
                  </div>
                )}

                {/* Entry blocks */}
                {dayEntries.map((entry) => (
                  <EntryBlock
                    key={entry.id}
                    entry={entry}
                    project={projects.find((p) => p.id === entry.project_id)}
                    workspaceTimezone={workspaceTimezone}
                    nowIso={nowIso}
                    onClick={() => setPopover({ mode: "edit", entry })}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Entry form popover ── */}
      {popover && (
        <EntryFormPopover
          popover={popover}
          projects={projects}
          workspaceTimezone={workspaceTimezone}
          pending={pending}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
