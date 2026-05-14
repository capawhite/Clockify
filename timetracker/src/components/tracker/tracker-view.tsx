"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import {
  deleteTimeEntry,
  saveManualEntry,
  startTimer,
  stopTimer,
  updateTimeEntry,
  type ActionResult,
} from "@/app/[locale]/(dashboard)/tracker/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  utcIsoToWorkspaceDatetimeLocal,
  utcIsoToWorkspaceDateAndTime,
  workspaceDateAndTimeToUtcIso,
  workspaceDatetimeLocalToUtcIso,
  workspaceNowDateAndTime,
} from "@/lib/tracker/workspace-datetime";
import {
  filterProjectsByClientScope,
  resolveBillableDefaultForProject,
  uniqueClientsFromProjects,
  type ClientScope,
} from "@/lib/tracker/client-project-scope";
import { getDateFnsLocale } from "@/lib/i18n/date-fns-locale";

export type TrackerProject = {
  id: string;
  name: string;
  color: string;
  client_id: string | null;
  client_name: string | null;
  client_default_is_billable: boolean | null;
  project_is_billable: boolean;
};

/** One slider step = this many minutes (end time = start + steps × this). */
const MANUAL_DURATION_STEP_MINUTES = 10;
const MANUAL_DURATION_MIN_STEPS = 1;
/** 24h max */
const MANUAL_DURATION_MAX_STEPS = 144;

function formatDurationFromSteps(steps: number): string {
  const totalMin = steps * MANUAL_DURATION_STEP_MINUTES;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export type TrackerEntry = {
  id: string;
  project_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  is_billable: boolean;
};

function formatElapsed(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

type TrackerViewProps = {
  userId: string;
  workspaceTimezone: string;
  projects: TrackerProject[];
  runningEntry: TrackerEntry | null;
  entries: TrackerEntry[];
};

export function TrackerView({
  userId,
  workspaceTimezone,
  projects,
  runningEntry,
  entries,
}: TrackerViewProps) {
  const router = useRouter();
  const locale = useLocale();
  const dfLocale = useMemo(() => getDateFnsLocale(locale), [locale]);
  const t = useTranslations("tracker");
  const tErr = useTranslations("errors");
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

  const [, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [description, setDescription] = useState("");
  const [clientScope, setClientScope] = useState<ClientScope>("__all__");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [billable, setBillable] = useState(() =>
    projects[0]
      ? resolveBillableDefaultForProject(projects[0])
      : true
  );
  const [manualDate, setManualDate] = useState(() =>
    workspaceNowDateAndTime(workspaceTimezone).date
  );
  const [manualTime, setManualTime] = useState(() =>
    workspaceNowDateAndTime(workspaceTimezone).time
  );
  /** Duration in units of MANUAL_DURATION_STEP_MINUTES. */
  const [manualDurationSteps, setManualDurationSteps] = useState(6);
  const [pending, setPending] = useState(false);

  const clientsOptions = useMemo(
    () => uniqueClientsFromProjects(projects),
    [projects]
  );
  const hasUnassignedProjects = useMemo(
    () => projects.some((p) => p.client_id == null),
    [projects]
  );
  const filteredProjects = useMemo(
    () => filterProjectsByClientScope(projects, clientScope),
    [projects, clientScope]
  );

  useEffect(() => {
    if (!filteredProjects.some((p) => p.id === projectId)) {
      const next = filteredProjects[0];
      setProjectId(next?.id ?? "");
      if (next) {
        setBillable(resolveBillableDefaultForProject(next));
      }
    }
  }, [filteredProjects, projectId]);

  useEffect(() => {
    if (!runningEntry) {
      return;
    }
    setDescription(runningEntry.description ?? "");
    setProjectId(runningEntry.project_id);
    setBillable(runningEntry.is_billable);
    const p = projects.find((x) => x.id === runningEntry.project_id);
    if (p) {
      setClientScope(p.client_id != null ? p.client_id : "__unassigned__");
    }
  }, [
    runningEntry,
    runningEntry?.id,
    runningEntry?.description,
    runningEntry?.project_id,
    runningEntry?.is_billable,
    projects,
  ]);

  const stateRef = useRef({
    mode,
    projectId,
    runningEntry,
    description,
    billable,
    manualDate,
    manualTime,
    manualDurationSteps,
  });
  stateRef.current = {
    mode,
    projectId,
    runningEntry,
    description,
    billable,
    manualDate,
    manualTime,
    manualDurationSteps,
  };

  useEffect(() => {
    if (!runningEntry || runningEntry.ended_at != null) {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [runningEntry, runningEntry?.id, runningEntry?.ended_at]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`time_entries:${userId}`)
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

  const elapsedLive = useMemo(() => {
    void tick;
    if (runningEntry && runningEntry.ended_at == null) {
      const start = new Date(runningEntry.started_at).getTime();
      return Math.max(0, Math.floor((Date.now() - start) / 1000));
    }
    return 0;
  }, [runningEntry, tick]);

  const doStart = useCallback(async () => {
    const s = stateRef.current;
    if (!s.projectId) {
      toast.error(t("pickProject"));
      return;
    }
    setPending(true);
    const res = await startTimer({
      project_id: s.projectId,
      description: s.description,
      is_billable: s.billable,
    });
    setPending(false);
    if (showActionResult(res)) {
      startTransition(() => router.refresh());
    }
  }, [router, showActionResult, t]);

  const doStop = useCallback(async () => {
    const s = stateRef.current;
    setPending(true);
    const res = await stopTimer({
      description: s.description,
      project_id: s.projectId,
      is_billable: s.billable,
    });
    setPending(false);
    if (showActionResult(res, t("timerStopped"))) {
      startTransition(() => router.refresh());
    }
  }, [router, showActionResult, t]);

  const toggleTimerFromKeyboard = useCallback(() => {
    const s = stateRef.current;
    if (s.mode !== "timer") {
      return;
    }
    if (!s.projectId) {
      return;
    }
    if (s.runningEntry) {
      void doStop();
    } else {
      void doStart();
    }
  }, [doStart, doStop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (!el) {
        return;
      }
      if (el.closest("input, textarea, select, [contenteditable]")) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.repeat) {
        return;
      }
      e.preventDefault();
      toggleTimerFromKeyboard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTimerFromKeyboard]);

  async function onSaveManual() {
    const s = stateRef.current;
    if (!s.projectId) {
      toast.error(t("pickProject"));
      return;
    }
    const startedAt = workspaceDateAndTimeToUtcIso(
      s.manualDate,
      s.manualTime,
      workspaceTimezone
    );
    if (!startedAt) {
      toast.error(t("invalidStartDateTime"));
      return;
    }
    const durationMs =
      s.manualDurationSteps *
      MANUAL_DURATION_STEP_MINUTES *
      60 *
      1000;
    const endedAt = new Date(
      new Date(startedAt).getTime() + durationMs
    ).toISOString();
    if (new Date(endedAt) <= new Date(startedAt)) {
      toast.error(t("durationMinStep"));
      return;
    }
    setPending(true);
    const res = await saveManualEntry({
      project_id: s.projectId,
      description: s.description,
      is_billable: s.billable,
      started_at: startedAt,
      ended_at: endedAt,
    });
    setPending(false);
    if (showActionResult(res, t("entrySaved"))) {
      startTransition(() => router.refresh());
    }
  }

  const manualEndPreview = useMemo(() => {
    const startIso = workspaceDateAndTimeToUtcIso(
      manualDate,
      manualTime,
      workspaceTimezone
    );
    if (!startIso) return "—";
    const endMs =
      new Date(startIso).getTime() +
      manualDurationSteps * MANUAL_DURATION_STEP_MINUTES * 60 * 1000;
    const iso = new Date(endMs).toISOString();
    try {
      return format(
        toZonedTime(new Date(iso), workspaceTimezone || "UTC"),
        "MMM d, HH:mm",
        { locale: dfLocale }
      );
    } catch {
      return format(new Date(iso), "MMM d, HH:mm", { locale: dfLocale });
    }
  }, [manualDate, manualTime, manualDurationSteps, workspaceTimezone, dfLocale]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {brand.productName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { company: brand.companyName })}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={mode === "timer" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("timer")}
            >
              {t("timerMode")}
            </Button>
            <Button
              type="button"
              variant={mode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("manual")}
            >
              {t("manualMode")}
            </Button>
          </div>
          {mode === "timer" && runningEntry ? (
            <span className="font-mono text-lg tabular-nums sm:text-right">
              {formatElapsed(elapsedLive)}
            </span>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="tracker-desc">{t("description")}</Label>
            <Input
              id="tracker-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("whatWorkingOn")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracker-client">{t("client")}</Label>
            <select
              id="tracker-client"
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={clientScope}
              onChange={(e) =>
                setClientScope(e.target.value as ClientScope)
              }
              disabled={
                !projects.length ||
                (!!runningEntry && runningEntry.ended_at === null)
              }
            >
              <option value="__all__">{t("allClients")}</option>
              {hasUnassignedProjects ? (
                <option value="__unassigned__">{t("noClient")}</option>
              ) : null}
              {clientsOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracker-project">{t("project")}</Label>
            <select
              id="tracker-project"
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={projectId}
              onChange={(e) => {
                const id = e.target.value;
                setProjectId(id);
                const p = projects.find((x) => x.id === id);
                if (p) {
                  setBillable(resolveBillableDefaultForProject(p));
                }
              }}
              disabled={!filteredProjects.length}
            >
              {!filteredProjects.length ? (
                <option value="">{t("noProjectsForClient")}</option>
              ) : (
                filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-1 sm:col-span-2">
            <Checkbox
              id="tracker-billable"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            <Label
              htmlFor="tracker-billable"
              className="cursor-pointer select-none text-sm font-normal"
            >
              {t("billableCheckboxLabel")}
            </Label>
          </div>
        </div>

        {mode === "manual" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-xs">
              {t("manualTzHint", { tz: workspaceTimezone })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manual-date">{t("date")}</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-time">{t("startTime")}</Label>
                <Input
                  id="manual-time"
                  type="time"
                  step={60}
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <Label htmlFor="manual-duration" className="text-foreground">
                    {t("duration")}
                  </Label>
                  <p
                    id="manual-duration-summary"
                    className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight"
                  >
                    {formatDurationFromSteps(manualDurationSteps)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {t("endsAt", {
                      preview: manualEndPreview,
                      tz: workspaceTimezone,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "30m", steps: 3 },
                    { label: "1h", steps: 6 },
                    { label: "2h", steps: 12 },
                    { label: "4h", steps: 24 },
                  ].map(({ label, steps }) => (
                    <Button
                      key={label}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setManualDurationSteps(steps)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2"
                  aria-label={t("ariaShorter")}
                  onClick={() =>
                    setManualDurationSteps((s) =>
                      Math.max(MANUAL_DURATION_MIN_STEPS, s - 1)
                    )
                  }
                >
                  −10m
                </Button>
                <input
                  id="manual-duration"
                  type="range"
                  className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
                  min={MANUAL_DURATION_MIN_STEPS}
                  max={MANUAL_DURATION_MAX_STEPS}
                  step={1}
                  value={manualDurationSteps}
                  onChange={(e) =>
                    setManualDurationSteps(Number(e.target.value))
                  }
                  aria-valuemin={MANUAL_DURATION_MIN_STEPS}
                  aria-valuemax={MANUAL_DURATION_MAX_STEPS}
                  aria-valuenow={manualDurationSteps}
                  aria-valuetext={formatDurationFromSteps(manualDurationSteps)}
                  aria-label={t("ariaDurationSlider")}
                  aria-describedby="manual-duration-summary"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2"
                  aria-label={t("ariaLonger")}
                  onClick={() =>
                    setManualDurationSteps((s) =>
                      Math.min(MANUAL_DURATION_MAX_STEPS, s + 1)
                    )
                  }
                >
                  +10m
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px] leading-snug">
                {t("durationSliderHelp")}
              </p>
            </div>

            <Button
              type="button"
              disabled={pending || !projects.length}
              className="w-full sm:w-auto"
              onClick={() => void onSaveManual()}
            >
              {t("saveEntry")}
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
            {runningEntry ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                className="w-full sm:w-auto"
                onClick={() => void doStop()}
              >
                {t("stop")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending || !projects.length}
                className="w-full sm:w-auto"
                onClick={() => void doStart()}
              >
                {t("start")}
              </Button>
            )}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("todaySection", { count: entries.length })}
        </h2>
        {!entries.length ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center sm:px-8">
            <p className="text-sm font-medium text-foreground">
              {t("noTimeTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {!projects.length
                ? t("noTimeNoProjects")
                : t("noTimeWithProjects")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {!projects.length ? (
                <Link href="/projects" className={cn(buttonVariants())}>
                  {t("goToProjects")}
                </Link>
              ) : (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void doStart()}
                >
                  {t("startTimer")}
                </Button>
              )}
              {projects.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode("manual");
                    document.getElementById("manual-date")?.focus();
                  }}
                >
                  {t("manualEntry")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {entries.map((entry) => (
              <TrackerEntryRow
                key={entry.id}
                entry={entry}
                workspaceTimezone={workspaceTimezone}
                projects={projects}
                onChanged={() => startTransition(() => router.refresh())}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TrackerEntryRow({
  entry,
  workspaceTimezone,
  projects,
  onChanged,
}: {
  entry: TrackerEntry;
  workspaceTimezone: string;
  projects: TrackerProject[];
  onChanged: () => void;
}) {
  const t = useTranslations("tracker");
  const tErr = useTranslations("errors");
  const tCommon = useTranslations("common");
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

  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const [desc, setDesc] = useState(entry.description ?? "");
  const [pid, setPid] = useState(entry.project_id);
  const [bill, setBill] = useState(entry.is_billable);
  const [startLocal, setStartLocal] = useState(() =>
    utcIsoToWorkspaceDatetimeLocal(entry.started_at, workspaceTimezone)
  );
  const [endLocal, setEndLocal] = useState(
    entry.ended_at
      ? utcIsoToWorkspaceDatetimeLocal(entry.ended_at, workspaceTimezone)
      : ""
  );
  const [inlineStartHm, setInlineStartHm] = useState(() =>
    utcIsoToWorkspaceDateAndTime(entry.started_at, workspaceTimezone).time
  );
  const [inlineEndHm, setInlineEndHm] = useState(() =>
    entry.ended_at
      ? utcIsoToWorkspaceDateAndTime(entry.ended_at, workspaceTimezone).time
      : ""
  );

  useEffect(() => {
    if (!editing) {
      setDesc(entry.description ?? "");
      setPid(entry.project_id);
      setBill(entry.is_billable);
      setStartLocal(
        utcIsoToWorkspaceDatetimeLocal(entry.started_at, workspaceTimezone)
      );
      setEndLocal(
        entry.ended_at
          ? utcIsoToWorkspaceDatetimeLocal(entry.ended_at, workspaceTimezone)
          : ""
      );
      setInlineStartHm(
        utcIsoToWorkspaceDateAndTime(entry.started_at, workspaceTimezone).time
      );
      setInlineEndHm(
        entry.ended_at
          ? utcIsoToWorkspaceDateAndTime(entry.ended_at, workspaceTimezone).time
          : ""
      );
    }
  }, [entry, editing, workspaceTimezone]);

  useEffect(() => {
    if (entry.ended_at) {
      return;
    }
    const id = window.setInterval(() => setLiveTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [entry.ended_at, entry.id]);

  const durationLabel = useMemo(() => {
    void liveTick;
    if (entry.ended_at === null) {
      return formatElapsed(
        Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(entry.started_at).getTime()) / 1000
          )
        )
      );
    }
    if (entry.duration_seconds != null) {
      return formatElapsed(entry.duration_seconds);
    }
    return "—";
  }, [
    liveTick,
    entry.ended_at,
    entry.started_at,
    entry.duration_seconds,
  ]);

  async function saveQuickTimes() {
    const origStart = utcIsoToWorkspaceDateAndTime(
      entry.started_at,
      workspaceTimezone
    ).time;
    const origEnd = entry.ended_at
      ? utcIsoToWorkspaceDateAndTime(entry.ended_at, workspaceTimezone).time
      : "";
    if (
      inlineStartHm === origStart &&
      (entry.ended_at === null || inlineEndHm === origEnd)
    ) {
      return;
    }
    const startDate = utcIsoToWorkspaceDateAndTime(
      entry.started_at,
      workspaceTimezone
    ).date;
    const startedAt = workspaceDateAndTimeToUtcIso(
      startDate,
      inlineStartHm,
      workspaceTimezone
    );
    if (!startedAt) {
      toast.error(t("invalidStart"));
      setInlineStartHm(origStart);
      return;
    }
    let endedAtIso: string | null = null;
    if (entry.ended_at === null) {
      endedAtIso = null;
    } else if (inlineEndHm.trim()) {
      const endDate = utcIsoToWorkspaceDateAndTime(
        entry.ended_at,
        workspaceTimezone
      ).date;
      endedAtIso = workspaceDateAndTimeToUtcIso(
        endDate,
        inlineEndHm,
        workspaceTimezone
      );
      if (!endedAtIso) {
        toast.error(t("invalidEnd"));
        setInlineEndHm(origEnd);
        return;
      }
    } else {
      toast.error(t("invalidEnd"));
      setInlineEndHm(origEnd);
      return;
    }
    setPending(true);
    const res = await updateTimeEntry({
      id: entry.id,
      project_id: entry.project_id,
      description: entry.description ?? "",
      is_billable: entry.is_billable,
      started_at: startedAt,
      ended_at: endedAtIso,
    });
    setPending(false);
    if (showActionResult(res, t("entrySaved"))) {
      onChanged();
    }
  }

  async function saveEdit() {
    if (!entry.ended_at && !endLocal.trim()) {
      toast.error(t("stopEntryHint"));
      return;
    }
    const startedAt = workspaceDatetimeLocalToUtcIso(
      startLocal,
      workspaceTimezone
    );
    if (!startedAt) {
      toast.error(t("invalidStart"));
      return;
    }
    let endedAtIso: string | null = null;
    if (endLocal.trim()) {
      endedAtIso = workspaceDatetimeLocalToUtcIso(endLocal, workspaceTimezone);
      if (!endedAtIso) {
        toast.error(t("invalidEnd"));
        return;
      }
    }
    setPending(true);
    const res = await updateTimeEntry({
      id: entry.id,
      project_id: pid,
      description: desc,
      is_billable: bill,
      started_at: startedAt,
      ended_at: endedAtIso,
    });
    setPending(false);
    if (showActionResult(res, t("entrySaved"))) {
      setEditing(false);
      onChanged();
    }
  }

  async function remove() {
    if (!window.confirm(t("deleteEntryConfirm"))) {
      return;
    }
    setPending(true);
    const res = await deleteTimeEntry(entry.id);
    setPending(false);
    if (showActionResult(res)) {
      onChanged();
    }
  }

  const proj = projects.find((p) => p.id === entry.project_id);

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3">
        <p className="text-muted-foreground text-xs">
          {t("timesWorkspaceHint", { tz: workspaceTimezone })}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("description")}</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("project")}</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={pid}
              onChange={(e) => {
                const id = e.target.value;
                setPid(id);
                const p = projects.find((x) => x.id === id);
                if (p) {
                  setBill(resolveBillableDefaultForProject(p));
                }
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("startLabel")}</Label>
            <Input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("endLabel")}</Label>
            <Input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="entry-billable"
              checked={bill}
              onChange={(e) => setBill(e.target.checked)}
            />
            <Label
              htmlFor="entry-billable"
              className="cursor-pointer select-none text-sm font-normal"
            >
              {t("billableCheckboxLabel")}
            </Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => void saveEdit()}
          >
            {tCommon("save")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: proj?.color ?? "#888" }}
          aria-hidden
        />
        <span className="font-medium">{proj?.name ?? t("projectUnknown")}</span>
        {entry.ended_at === null ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
            {t("running")}
          </span>
        ) : null}
        <span
          className={
            entry.is_billable
              ? "rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-400"
              : "text-xs text-muted-foreground"
          }
        >
          {entry.is_billable ? t("billableTag") : t("nonBillableTag")}
        </span>
        <div className="flex flex-wrap items-center gap-1 tabular-nums">
          <Input
            type="time"
            className="h-7 w-[5.5rem] px-1 text-xs"
            value={inlineStartHm}
            disabled={pending}
            aria-label={t("inlineStartAria")}
            onChange={(e) => setInlineStartHm(e.target.value)}
            onBlur={() => void saveQuickTimes()}
          />
          <span className="text-muted-foreground">→</span>
          {entry.ended_at ? (
            <Input
              type="time"
              className="h-7 w-[5.5rem] px-1 text-xs"
              value={inlineEndHm}
              disabled={pending}
              aria-label={t("inlineEndAria")}
              onChange={(e) => setInlineEndHm(e.target.value)}
              onBlur={() => void saveQuickTimes()}
            />
          ) : (
            <span className="text-muted-foreground px-1 text-xs">—</span>
          )}
        </div>
        <span className="font-mono text-xs tabular-nums">{durationLabel}</span>
        {entry.description ? (
          <span className="min-w-0 max-w-full truncate text-muted-foreground">
            · {entry.description}
          </span>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setEditing(true)}
        >
          {tCommon("edit")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => void remove()}
        >
          {tCommon("delete")}
        </Button>
      </div>
    </li>
  );
}
