"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { workspaceDateAndTimeToUtcIso } from "@/lib/tracker/workspace-datetime";
import type { CalendarEntry, PopoverState } from "./types";
import type { TrackerProject } from "@/components/tracker/tracker-view";

type CreateData = {
  project_id: string;
  description: string;
  is_billable: boolean;
  started_at: string;
  ended_at: string;
};

type UpdateData = {
  project_id: string;
  description: string;
  is_billable: boolean;
  started_at: string;
  ended_at: string | null;
};

type Props = {
  popover: PopoverState;
  projects: TrackerProject[];
  workspaceTimezone: string;
  pending: boolean;
  onCreate: (data: CreateData) => Promise<void>;
  onUpdate: (id: string, data: UpdateData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

function minutesToHm(minutes: number): string {
  const m = Math.min(1439, Math.max(0, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function initFromEntry(
  entry: CalendarEntry,
  tz: string
): { date: string; startTime: string; endTime: string } {
  return {
    date: formatInTimeZone(new Date(entry.started_at), tz, "yyyy-MM-dd"),
    startTime: formatInTimeZone(new Date(entry.started_at), tz, "HH:mm"),
    endTime: entry.ended_at
      ? formatInTimeZone(new Date(entry.ended_at), tz, "HH:mm")
      : "",
  };
}

export function EntryFormPopover({
  popover,
  projects,
  workspaceTimezone,
  pending,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const isEdit = popover.mode === "edit";
  const entry = isEdit ? popover.entry : null;

  const [date, setDate] = useState(() => {
    if (isEdit) return initFromEntry(entry!, workspaceTimezone).date;
    return (popover as Extract<PopoverState, { mode: "create" }>).date;
  });
  const [startTime, setStartTime] = useState(() => {
    if (isEdit) return initFromEntry(entry!, workspaceTimezone).startTime;
    return minutesToHm(
      (popover as Extract<PopoverState, { mode: "create" }>).startMin
    );
  });
  const [endTime, setEndTime] = useState(() => {
    if (isEdit) return initFromEntry(entry!, workspaceTimezone).endTime;
    return minutesToHm(
      (popover as Extract<PopoverState, { mode: "create" }>).endMin
    );
  });
  const [description, setDescription] = useState(entry?.description ?? "");
  const [projectId, setProjectId] = useState(
    entry?.project_id ?? projects[0]?.id ?? ""
  );
  const [billable, setBillable] = useState(entry?.is_billable ?? true);

  async function handleSave() {
    if (!projectId) return;
    const started_at = workspaceDateAndTimeToUtcIso(
      date,
      startTime,
      workspaceTimezone
    );
    if (!started_at) return;

    if (isEdit) {
      const ended_at = endTime
        ? workspaceDateAndTimeToUtcIso(date, endTime, workspaceTimezone)
        : null;
      await onUpdate(entry!.id, {
        project_id: projectId,
        description,
        is_billable: billable,
        started_at,
        ended_at,
      });
    } else {
      const ended_at = workspaceDateAndTimeToUtcIso(
        date,
        endTime,
        workspaceTimezone
      );
      if (!ended_at) return;
      await onCreate({
        project_id: projectId,
        description,
        is_billable: billable,
        started_at,
        ended_at,
      });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Form card */}
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {isEdit ? t("editEntry") : t("newEntry")}
          </h3>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Date + times */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("date")}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm px-2"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("start")}</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-sm px-2"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("end")}</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 text-sm px-2"
              placeholder="—"
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">{t("description")}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("placeholder")}
            className="h-8 text-sm"
            autoFocus={!isEdit}
          />
        </div>

        {/* Project */}
        <div className="space-y-1">
          <Label className="text-xs">{t("project")}</Label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Billable */}
        <div className="flex items-center gap-2">
          <Switch
            id="cal-billable"
            checked={billable}
            onCheckedChange={(v) => setBillable(Boolean(v))}
          />
          <Label htmlFor="cal-billable" className="text-sm cursor-pointer select-none">
            {billable ? t("billable") : t("notBillable")}
          </Label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          {isEdit ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => onDelete(entry!.id)}
            >
              {tCommon("delete")}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onClose}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !projectId}
              onClick={() => void handleSave()}
            >
              {tCommon("save")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
