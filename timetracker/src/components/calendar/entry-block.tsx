"use client";

import { formatInTimeZone } from "date-fns-tz";
import type { CalendarEntry } from "./types";
import type { TrackerProject } from "@/components/tracker/tracker-view";

export const HOUR_HEIGHT = 64;
export const TOTAL_HEIGHT = HOUR_HEIGHT * 24;
const MIN_BLOCK_HEIGHT = 20;

export function minuteOfDayInZone(iso: string, tz: string): number {
  const str = formatInTimeZone(new Date(iso), tz, "HH:mm");
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

export function minuteToY(m: number): number {
  return (m / 1440) * TOTAL_HEIGHT;
}

type Props = {
  entry: CalendarEntry;
  project: TrackerProject | undefined;
  workspaceTimezone: string;
  nowIso: string;
  onClick: () => void;
};

export function EntryBlock({
  entry,
  project,
  workspaceTimezone,
  nowIso,
  onClick,
}: Props) {
  const startMin = minuteOfDayInZone(entry.started_at, workspaceTimezone);
  const rawEndMin = entry.ended_at
    ? minuteOfDayInZone(entry.ended_at, workspaceTimezone)
    : minuteOfDayInZone(nowIso, workspaceTimezone);

  // Entry spanning past midnight: cap at end of day
  const effectiveEndMin = rawEndMin <= startMin ? 1440 : rawEndMin;
  const durationMin = effectiveEndMin - startMin;

  const topY = minuteToY(startMin);
  const heightPx = Math.max(MIN_BLOCK_HEIGHT, minuteToY(durationMin));

  const color = project?.color ?? "#6366f1";
  const isRunning = !entry.ended_at;
  const isShort = heightPx < 36;

  const hh = Math.floor(durationMin / 60);
  const mm = durationMin % 60;
  const durationLabel =
    hh > 0 && mm > 0
      ? `${hh}h ${mm}m`
      : hh > 0
        ? `${hh}h`
        : `${mm}m`;

  return (
    <div
      data-entry-block="true"
      className="absolute inset-x-0.5 rounded overflow-hidden cursor-pointer hover:brightness-105 active:brightness-95 transition-all z-10 select-none"
      style={{
        top: topY,
        height: heightPx,
        backgroundColor: color + "bb",
        borderLeft: `3px solid ${color}`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="px-1.5 py-0.5 overflow-hidden h-full">
        <p className="text-[11px] font-semibold leading-tight truncate text-white drop-shadow-sm">
          {project?.name ?? "Unknown project"}
          {isRunning && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse align-middle" />
          )}
          {entry.is_billable && (
            <span className="ml-1 text-[9px] opacity-80">$</span>
          )}
        </p>
        {!isShort && entry.description && (
          <p className="text-[10px] leading-tight truncate text-white/80">
            {entry.description}
          </p>
        )}
        {!isShort && (
          <p className="text-[10px] leading-tight text-white/70">{durationLabel}</p>
        )}
      </div>
    </div>
  );
}
