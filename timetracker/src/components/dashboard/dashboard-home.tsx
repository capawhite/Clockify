"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startTimer, stopTimer } from "@/app/[locale]/(dashboard)/tracker/actions";
import { brand } from "@/lib/brand";
import { getDateFnsLocale } from "@/lib/i18n/date-fns-locale";

export type DashboardHomeProps = {
  timezone: string;
  todaySeconds: number;
  thisWeekSeconds: number;
  lastWeekSeconds: number;
  running: {
    id: string;
    description: string | null;
    started_at: string;
    projectName: string;
    projectColor: string;
  } | null;
  resumeChips: {
    description: string;
    project_id: string;
    is_billable: boolean;
  }[];
  topProjectsWeek: { name: string; hours: number; color: string }[];
  teamActivity: {
    userId: string;
    name: string;
    projectName: string;
    started_at: string;
  }[] | null;
  isAdmin: boolean;
};

function fmtHours(seconds: number, digits = 1): string {
  return (seconds / 3600).toFixed(digits);
}

function formatElapsed(startedAt: string, tick: number): string {
  void tick;
  const start = new Date(startedAt).getTime();
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function DashboardHome({
  timezone,
  todaySeconds,
  thisWeekSeconds,
  lastWeekSeconds,
  running,
  resumeChips,
  topProjectsWeek,
  teamActivity,
  isAdmin,
}: DashboardHomeProps) {
  const router = useRouter();
  const locale = useLocale();
  const dfLocale = useMemo(() => getDateFnsLocale(locale), [locale]);
  const t = useTranslations("dashboard");
  const tErr = useTranslations("errors");
  const [pending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [chipError, setChipError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const deltaSeconds = thisWeekSeconds - lastWeekSeconds;

  const chartData = useMemo(
    () =>
      topProjectsWeek.map((p) => ({
        name: p.name.length > 22 ? `${p.name.slice(0, 20)}…` : p.name,
        fullName: p.name,
        hours: p.hours,
        color: p.color,
      })),
    [topProjectsWeek]
  );

  const onStop = useCallback(() => {
    startTransition(async () => {
      const res = await stopTimer();
      if (!res.ok) {
        toast.error(tErr(res.errorKey, res.values));
        return;
      }
      toast.success(t("timerStopped"));
      router.refresh();
    });
  }, [router, t, tErr]);

  const onResume = useCallback(
    (chip: { description: string; project_id: string; is_billable: boolean }) => {
      setChipError(null);
      startTransition(async () => {
        const res = await startTimer({
          project_id: chip.project_id,
          description: chip.description,
          is_billable: chip.is_billable,
        });
        if (!res.ok) {
          const msg = tErr(res.errorKey, res.values);
          setChipError(msg);
          toast.error(msg);
          return;
        }
        setChipError(null);
        router.refresh();
      });
    },
    [router, tErr]
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", {
              shortName: brand.shortName,
              timezone,
            })}
          </p>
        </div>
        <Link
          href="/tracker"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("openTimer")}
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("today")}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {fmtHours(todaySeconds)}
            <span className="text-lg font-normal text-muted-foreground">h</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("todayHint")}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:col-span-2 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("thisWeekVsLast")}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-6">
            <div>
              <p className="text-3xl font-semibold tabular-nums">
                {fmtHours(thisWeekSeconds)}
                <span className="text-lg font-normal text-muted-foreground">h</span>
              </p>
              <p className="text-xs text-muted-foreground">{t("thisWeek")}</p>
            </div>
            <div>
              <p className="text-xl tabular-nums text-muted-foreground">
                {fmtHours(lastWeekSeconds)}h
              </p>
              <p className="text-xs text-muted-foreground">{t("lastWeek")}</p>
            </div>
            <div className="flex items-center gap-2">
              {deltaSeconds === 0 ? (
                <span className="text-sm text-muted-foreground">{t("noChange")}</span>
              ) : deltaSeconds > 0 ? (
                <>
                  <TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {t("upVsLastWeek", {
                      hours: fmtHours(deltaSeconds, 2),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-5 w-5 text-amber-600" aria-hidden />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    {t("downVsLastWeek", {
                      hours: fmtHours(deltaSeconds, 2),
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {running ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("activeTimer")}
              </p>
              <p className="truncate text-lg font-medium">{running.projectName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {running.description || t("noDescription")}
              </p>
              <p
                className="font-mono text-2xl font-semibold tabular-nums tracking-tight"
                suppressHydrationWarning
              >
                {formatElapsed(running.started_at, tick)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("started")}{" "}
                {formatInTimeZone(
                  running.started_at,
                  timezone,
                  "MMM d, yyyy HH:mm",
                  { locale: dfLocale }
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onStop}
            >
              {t("stop")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("quickStart")}</h2>
          {chipError ? (
            <span className="text-xs text-destructive">{chipError}</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("quickStartHint")}</p>
        {resumeChips.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noChips")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {resumeChips.map((c) => (
              <button
                key={c.description}
                type="button"
                disabled={pending}
                onClick={() => onResume(c)}
                className="max-w-full truncate rounded-full border border-border bg-muted/40 px-3 py-1.5 text-left text-sm transition hover:bg-muted disabled:opacity-50"
                title={c.description}
              >
                {c.description.length > 48
                  ? `${c.description.slice(0, 46)}…`
                  : c.description}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("topProjects")}</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCompletedWeek")}</p>
        ) : (
          <div className="h-[180px] w-full min-w-0 rounded-lg border border-border bg-card p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(v) => [
                    `${Number(v ?? 0).toFixed(2)} h`,
                    t("hours"),
                  ]}
                  labelFormatter={(_, p) =>
                    String(
                      (p?.[0]?.payload as { fullName?: string })?.fullName ?? ""
                    )
                  }
                />
                <Bar dataKey="hours" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e.color || "var(--chart-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {isAdmin && teamActivity !== null ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("teamActivity")}</h2>
          <p className="text-xs text-muted-foreground">{t("teamActivityHint")}</p>
          {teamActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActiveTimers")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {teamActivity.map((row) => (
                <li
                  key={row.userId}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">{row.projectName}</span>
                  <span className="w-full text-xs text-muted-foreground sm:w-auto sm:text-right">
                    {t("since")}{" "}
                    {formatInTimeZone(
                      row.started_at,
                      timezone,
                      "MMM d, HH:mm",
                      { locale: dfLocale }
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
