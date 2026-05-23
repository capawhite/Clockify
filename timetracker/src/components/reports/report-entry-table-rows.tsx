"use client";

import type { ReportEntryRow } from "@/lib/reports/aggregate";
import { ReportEditableDatetime } from "@/components/reports/report-editable-datetime";

function formatHms(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ReportEntryTableRows({
  rows,
  canFilterTeam,
  canEditAnyEntry,
  currentUserId,
  workspaceTimezone,
  nameByUserId,
  billableYes,
  billableNo,
}: {
  rows: ReportEntryRow[];
  canFilterTeam: boolean;
  canEditAnyEntry: boolean;
  currentUserId: string;
  workspaceTimezone: string;
  nameByUserId: Record<string, string>;
  billableYes: string;
  billableNo: string;
}) {
  return (
    <>
      {rows.map((row) => {
        const canEdit =
          canEditAnyEntry || row.user_id === currentUserId;
        return (
          <tr key={row.id} className="border-b last:border-0">
            {canFilterTeam ? (
              <td className="max-w-[140px] truncate p-3">
                {nameByUserId[row.user_id] ?? row.user_id}
              </td>
            ) : null}
            <td className="max-w-[160px] truncate p-3">
              {row.projects?.name ?? "—"}
            </td>
            <td className="max-w-[220px] truncate p-3">
              {row.description || "—"}
            </td>
            <ReportEditableDatetime
              row={row}
              field="start"
              workspaceTimezone={workspaceTimezone}
              canEdit={canEdit}
            />
            <ReportEditableDatetime
              row={row}
              field="end"
              workspaceTimezone={workspaceTimezone}
              canEdit={canEdit}
            />
            <td className="p-3 tabular-nums">{formatHms(row.duration_seconds)}</td>
            <td className="p-3">
              {row.is_billable ? billableYes : billableNo}
            </td>
          </tr>
        );
      })}
    </>
  );
}
