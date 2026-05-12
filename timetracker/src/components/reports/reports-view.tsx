"use client";

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ProjectAgg, SummaryStats, UserAgg } from "@/lib/reports/aggregate";
import type { ReportEntryRow } from "@/lib/reports/aggregate";
import {
  presetRangeYmd,
  type BillableFilterParam,
  type ReportTabParam,
} from "@/lib/reports/range";
import { brand } from "@/lib/brand";
import { getDateFnsLocale } from "@/lib/i18n/date-fns-locale";
import { REPORTS_FETCH_MAX_ROWS } from "@/lib/reports/fetch-entries";
import { toast } from "sonner";

export type ReportsViewProps = {
  workspaceTimezone: string;
  weekStartsOn: "mon" | "sun";
  currency: string;
  canFilterTeam: boolean;
  filters: {
    from: string;
    to: string;
    userId: string | null;
    projectId: string | null;
    billable: BillableFilterParam;
    tab: ReportTabParam;
  };
  members: { id: string; full_name: string }[];
  projects: { id: string; name: string }[];
  nameByUserId: Record<string, string>;
  summary: SummaryStats;
  byProject: ProjectAgg[];
  byUser: UserAgg[] | null;
  detailedRows: ReportEntryRow[];
  reportsTruncated?: boolean;
};

function formatHours(seconds: number, digits = 2): string {
  return (seconds / 3600).toFixed(digits);
}

function formatHms(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildQueryString(
  base: Record<string, string | undefined | null>
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== "") p.set(k, v);
  }
  return p.toString();
}

const tabIds: {
  id: ReportTabParam;
  labelKey: "tabSummary" | "tabByProject" | "tabByUser" | "tabDetailed";
  managerOnly?: boolean;
}[] = [
  { id: "summary", labelKey: "tabSummary" },
  { id: "by-project", labelKey: "tabByProject" },
  { id: "by-user", labelKey: "tabByUser", managerOnly: true },
  { id: "detailed", labelKey: "tabDetailed" },
];

export function ReportsView({
  workspaceTimezone,
  weekStartsOn,
  currency,
  canFilterTeam,
  filters,
  members,
  projects,
  nameByUserId,
  summary,
  byProject,
  byUser,
  detailedRows,
  reportsTruncated = false,
}: ReportsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const tr = useTranslations("reports");
  const [, startNav] = useTransition();

  const dateFnsLocale = useMemo(() => getDateFnsLocale(locale), [locale]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === "es" ? "es" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency, locale]
  );

  const navigateWithFilters = useCallback(
    (patch: Partial<typeof filters>) => {
      const next = { ...filters, ...patch };
      const q = buildQueryString({
        from: next.from,
        to: next.to,
        user: next.userId ?? undefined,
        project: next.projectId ?? undefined,
        billable: next.billable === "all" ? undefined : next.billable,
        tab: next.tab === "summary" ? undefined : next.tab,
      });
      startNav(() => {
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      });
    },
    [filters, pathname, router]
  );

  const applyPreset = (preset: Parameters<typeof presetRangeYmd>[0]) => {
    const { from, to } = presetRangeYmd(
      preset,
      workspaceTimezone,
      weekStartsOn
    );
    navigateWithFilters({ from, to });
  };

  const onApplyDates = (formData: FormData) => {
    const from = String(formData.get("from") ?? "").slice(0, 10);
    const to = String(formData.get("to") ?? "").slice(0, 10);
    navigateWithFilters({ from, to });
  };

  const billableTriState: "all" | "yes" | "no" = filters.billable;

  const chartProjectData = byProject.map((p) => ({
    name: p.name.length > 28 ? `${p.name.slice(0, 26)}…` : p.name,
    hours: p.seconds / 3600,
    color: p.color,
    fullName: p.name,
  }));

  const chartUserData =
    byUser?.map((u) => ({
      name: u.name.length > 28 ? `${u.name.slice(0, 26)}…` : u.name,
      hours: u.seconds / 3600,
      fullName: u.name,
    })) ?? [];

  const downloadCsv = () => {
    if (reportsTruncated) {
      toast.message(tr("exportIncompleteTitle"), {
        description: tr("exportIncompleteBody", {
          max: REPORTS_FETCH_MAX_ROWS.toLocaleString(),
        }),
      });
    }
    const headers = [
      "id",
      "user",
      "project",
      "description",
      "started_at",
      "ended_at",
      "duration_seconds",
      "is_billable",
      "amount",
    ];
    const lines = [headers.join(",")];
    for (const row of detailedRows) {
      const secs = row.duration_seconds;
      const amount =
        row.is_billable && secs != null
          ? (
              (secs / 3600) *
              Number(row.projects?.hourly_rate ?? 0)
            ).toFixed(2)
          : "0";
      const vals = [
        row.id,
        nameByUserId[row.user_id] ?? row.user_id,
        row.projects?.name ?? "",
        row.description ?? "",
        row.started_at,
        row.ended_at ?? "",
        secs != null ? String(secs) : "",
        row.is_billable ? "yes" : "no",
        amount,
      ].map((v) => csvEscape(String(v)));
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${filters.from}-to-${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleTabs = tabIds.filter(
    (tab) => !tab.managerOnly || canFilterTeam
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tr("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr("subtitle", {
            company: brand.companyName,
            tz: workspaceTimezone,
          })}
        </p>
      </div>

      {reportsTruncated ? (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-50"
        >
          {tr("truncatedBanner", {
            max: REPORTS_FETCH_MAX_ROWS.toLocaleString(),
          })}
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset("this_week")}
          >
            {tr("presetThisWeek")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset("last_week")}
          >
            {tr("presetLastWeek")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset("this_month")}
          >
            {tr("presetThisMonth")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset("last_30")}
          >
            {tr("presetLast30")}
          </Button>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            onApplyDates(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rep-from">{tr("labelFrom")}</Label>
            <input
              id="rep-from"
              name="from"
              type="date"
              key={`from-${filters.from}`}
              defaultValue={filters.from}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-to">{tr("labelTo")}</Label>
            <input
              id="rep-to"
              name="to"
              type="date"
              key={`to-${filters.to}`}
              defaultValue={filters.to}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            />
          </div>

          {canFilterTeam ? (
            <div className="space-y-1.5">
              <Label htmlFor="rep-user">{tr("labelUser")}</Label>
              <select
                id="rep-user"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={filters.userId ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  navigateWithFilters({ userId: v });
                }}
              >
                <option value="">{tr("allUsers")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || tr("unnamedUser")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rep-project">{tr("labelProject")}</Label>
            <select
              id="rep-project"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={filters.projectId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                navigateWithFilters({ projectId: v });
              }}
            >
              <option value="">{tr("allProjects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-2">
            <span className="text-sm font-medium">{tr("billableFilter")}</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all" as const, labelKey: "billableAll" as const },
                  { id: "yes" as const, labelKey: "billableBillable" as const },
                  { id: "no" as const, labelKey: "billableNonBillable" as const },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={billableTriState === opt.id ? "default" : "outline"}
                  onClick={() => navigateWithFilters({ billable: opt.id })}
                >
                  {tr(opt.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button type="submit" className="w-full sm:w-auto">
              {tr("applyDateRange")}
            </Button>
          </div>
        </form>
      </section>

      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {visibleTabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={filters.tab === tab.id ? "default" : "ghost"}
            className="rounded-b-none"
            onClick={() => navigateWithFilters({ tab: tab.id })}
          >
            {tr(tab.labelKey)}
          </Button>
        ))}
      </div>

      {filters.tab === "summary" ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title={tr("statTotalHours")}
            value={formatHours(summary.totalSeconds)}
          />
          <StatCard
            title={tr("statBillableHours")}
            value={formatHours(summary.billableSeconds)}
          />
          <StatCard
            title={tr("statNonBillableHours")}
            value={formatHours(summary.nonBillableSeconds)}
          />
          <StatCard
            title={tr("statBillableAmount")}
            value={money.format(summary.billableAmount)}
          />
          <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p className="font-medium">{tr("splitTitle")}</p>
            <p className="mt-2 text-muted-foreground">
              {tr("splitBody", {
                pct: pct(summary.billableSeconds, summary.totalSeconds),
              })}
            </p>
          </div>
        </section>
      ) : null}

      {filters.tab === "by-project" ? (
        <section className="space-y-6">
          {byProject.length === 0 ? (
            <Empty message={tr("emptyNoCompleted")} />
          ) : (
            <>
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartProjectData}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      type="number"
                      tickFormatter={(v) =>
                        tr("axisHoursSuffix", { hours: String(v) })
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => [
                        tr("chartHoursValue", {
                          hours: Number(value ?? 0).toFixed(2),
                        }),
                        tr("chartSeriesHours"),
                      ]}
                      labelFormatter={(_, payload) =>
                        String(
                          (payload?.[0]?.payload as { fullName?: string })
                            ?.fullName ?? ""
                        )
                      }
                    />
                    <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {chartProjectData.map((entry, i) => (
                        <Cell key={i} fill={entry.color || "var(--chart-2)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="p-3 font-medium">{tr("colProject")}</th>
                      <th className="p-3 font-medium">{tr("colHours")}</th>
                      <th className="p-3 font-medium">{tr("colBillableAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProject.map((p) => (
                      <tr key={p.projectId} className="border-b last:border-0">
                        <td className="p-3">{p.name}</td>
                        <td className="p-3 tabular-nums">
                          {formatHours(p.seconds)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {money.format(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {filters.tab === "by-user" && canFilterTeam && byUser ? (
        <section className="space-y-6">
          {byUser.length === 0 ? (
            <Empty message={tr("emptyNoCompleted")} />
          ) : (
            <>
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartUserData}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      type="number"
                      tickFormatter={(v) =>
                        tr("axisHoursSuffix", { hours: String(v) })
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => [
                        tr("chartHoursValue", {
                          hours: Number(value ?? 0).toFixed(2),
                        }),
                        tr("chartSeriesHours"),
                      ]}
                      labelFormatter={(_, payload) =>
                        String(
                          (payload?.[0]?.payload as { fullName?: string })
                            ?.fullName ?? ""
                        )
                      }
                    />
                    <Bar
                      dataKey="hours"
                      fill="var(--chart-2)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="p-3 font-medium">{tr("colUser")}</th>
                      <th className="p-3 font-medium">{tr("colHours")}</th>
                      <th className="p-3 font-medium">{tr("colBillableAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byUser.map((u) => (
                      <tr key={u.userId} className="border-b last:border-0">
                        <td className="p-3">{u.name}</td>
                        <td className="p-3 tabular-nums">
                          {formatHours(u.seconds)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {money.format(u.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {filters.tab === "detailed" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {tr("detailedEntryCount", { count: detailedRows.length })}
            </p>
            <Button type="button" variant="outline" onClick={downloadCsv}>
              {tr("exportCsv")}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {canFilterTeam ? (
                    <th className="p-3 font-medium">{tr("colUser")}</th>
                  ) : null}
                  <th className="p-3 font-medium">{tr("colProject")}</th>
                  <th className="p-3 font-medium">{tr("colDescription")}</th>
                  <th className="p-3 font-medium">{tr("colStart")}</th>
                  <th className="p-3 font-medium">{tr("colEnd")}</th>
                  <th className="p-3 font-medium">{tr("colDuration")}</th>
                  <th className="p-3 font-medium">{tr("colBillable")}</th>
                </tr>
              </thead>
              <tbody>
                {detailedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canFilterTeam ? 7 : 6}
                      className="p-6 text-center text-muted-foreground"
                    >
                      {tr("noEntriesFilters")}
                    </td>
                  </tr>
                ) : (
                  detailedRows.map((row) => (
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
                      <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
                        {formatInTimeZone(
                          row.started_at,
                          workspaceTimezone,
                          "yyyy-MM-dd HH:mm",
                          { locale: dateFnsLocale }
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
                        {row.ended_at
                          ? formatInTimeZone(
                              row.ended_at,
                              workspaceTimezone,
                              "yyyy-MM-dd HH:mm",
                              { locale: dateFnsLocale }
                            )
                          : "—"}
                      </td>
                      <td className="p-3 tabular-nums">
                        {formatHms(row.duration_seconds)}
                      </td>
                      <td className="p-3">
                        {row.is_billable
                          ? tr("billableYes")
                          : tr("billableNo")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((100 * part) / whole)}%`;
}

function Empty({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}
