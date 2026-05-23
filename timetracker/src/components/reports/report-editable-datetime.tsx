"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { updateTimeEntry } from "@/app/[locale]/(dashboard)/tracker/actions";
import type { ReportEntryRow } from "@/lib/reports/aggregate";
import type { ActionResult } from "@/lib/i18n/action-result";
import {
  utcIsoToWorkspaceDatetimeLocal,
  workspaceDatetimeLocalToUtcIso,
} from "@/lib/tracker/workspace-datetime";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/i18n/date-fns-locale";
import { useLocale } from "next-intl";

const DISPLAY_FMT = "yyyy-MM-dd HH:mm";

type ReportEditableDatetimeProps = {
  row: ReportEntryRow;
  field: "start" | "end";
  workspaceTimezone: string;
  canEdit: boolean;
};

export function ReportEditableDatetime({
  row,
  field,
  workspaceTimezone,
  canEdit,
}: ReportEditableDatetimeProps) {
  const router = useRouter();
  const locale = useLocale();
  const tr = useTranslations("reports");
  const tTracker = useTranslations("tracker");
  const tErr = useTranslations("errors");
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const iso = field === "start" ? row.started_at : row.ended_at;
  const display =
    iso != null
      ? formatInTimeZone(new Date(iso), workspaceTimezone, DISPLAY_FMT, {
          locale: getDateFnsLocale(locale),
        })
      : "—";

  const [draft, setDraft] = useState(() =>
    iso ? utcIsoToWorkspaceDatetimeLocal(iso, workspaceTimezone) : ""
  );

  useEffect(() => {
    if (!editing) {
      setDraft(iso ? utcIsoToWorkspaceDatetimeLocal(iso, workspaceTimezone) : "");
    }
  }, [iso, editing, workspaceTimezone]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const showActionResult = useCallback(
    (res: ActionResult, successMessage?: string): boolean => {
      if (!res.ok) {
        toast.error(tErr(res.errorKey, res.values));
        return false;
      }
      if (successMessage) {
        toast.success(successMessage);
      }
      return true;
    },
    [tErr]
  );

  const cancel = useCallback(() => {
    setDraft(iso ? utcIsoToWorkspaceDatetimeLocal(iso, workspaceTimezone) : "");
    setEditing(false);
  }, [iso, workspaceTimezone]);

  const save = useCallback(() => {
    if (!canEdit || field === "end" && !row.ended_at) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(
        field === "start" ? tTracker("invalidStart") : tTracker("invalidEnd")
      );
      cancel();
      return;
    }

    const editedIso = workspaceDatetimeLocalToUtcIso(trimmed, workspaceTimezone);
    if (!editedIso) {
      toast.error(
        field === "start" ? tTracker("invalidStart") : tTracker("invalidEnd")
      );
      cancel();
      return;
    }

    const startedAt =
      field === "start" ? editedIso : row.started_at;
    const endedAt =
      field === "end" ? editedIso : row.ended_at;

    if (!endedAt) {
      toast.error(tTracker("invalidEnd"));
      cancel();
      return;
    }

    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(endedAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      toast.error(tErr("END_BEFORE_START"));
      cancel();
      return;
    }

    const durationMs = endMs - startMs;
    const maxMs = 24 * 60 * 60 * 1000;
    if (durationMs > maxMs) {
      toast.error(tr("durationTooLong"));
      cancel();
      return;
    }

    const origLocal = iso
      ? utcIsoToWorkspaceDatetimeLocal(iso, workspaceTimezone)
      : "";
    if (trimmed === origLocal) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateTimeEntry({
        id: row.id,
        project_id: row.project_id,
        description: row.description ?? "",
        is_billable: row.is_billable,
        started_at: startedAt,
        ended_at: endedAt,
      });
      if (showActionResult(res, tTracker("entrySaved"))) {
        setEditing(false);
        router.refresh();
      }
    });
  }, [
    canEdit,
    field,
    row,
    draft,
    workspaceTimezone,
    cancel,
    showActionResult,
    tTracker,
    tErr,
    tr,
    router,
    iso,
  ]);

  if (!canEdit || (field === "end" && !row.ended_at)) {
    return (
      <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
        {display}
      </td>
    );
  }

  if (editing) {
    return (
      <td className="whitespace-nowrap p-2 tabular-nums">
        <input
          ref={inputRef}
          type="datetime-local"
          step={60}
          disabled={isPending}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
              setEditing(false);
            }
          }}
          aria-label={
            field === "start" ? tr("editStartAria") : tr("editEndAria")
          }
          className={cn(
            "h-8 w-full min-w-[11rem] rounded-md border border-input bg-background px-2 text-sm",
            "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            isPending && "opacity-60"
          )}
        />
      </td>
    );
  }

  return (
    <td className="whitespace-nowrap p-3 tabular-nums">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setEditing(true)}
        title={field === "start" ? tr("editStartHint") : tr("editEndHint")}
        className={cn(
          "rounded px-1 py-0.5 text-left text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {display}
      </button>
    </td>
  );
}
