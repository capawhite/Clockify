import { formatInTimeZone } from "date-fns-tz";
import * as XLSX from "xlsx";
import {
  aggregateByProject,
  entrySeconds,
  formatHours,
  type ReportEntryRow,
  type SummaryStats,
  type UserAgg,
} from "@/lib/reports/aggregate";
import { getDateFnsLocale } from "@/lib/i18n/date-fns-locale";

export type ReportExportLabels = {
  colUser: string;
  colClient: string;
  colProject: string;
  colDescription: string;
  colStart: string;
  colEnd: string;
  colDurationHours: string;
  colDurationHms: string;
  colBillable: string;
  colAmount: string;
  billableYes: string;
  billableNo: string;
  unassignedClient: string;
  sheetEntries: string;
  sheetByProject: string;
  sheetByUser: string;
  sheetSummary: string;
  summaryTotalHours: string;
  summaryBillableHours: string;
  summaryNonBillableHours: string;
  summaryBillableAmount: string;
  colHours: string;
  colBillableAmount: string;
};

const DISPLAY_DT = "yyyy-MM-dd HH:mm";

function formatHms(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function clientNameFromRow(row: ReportEntryRow, unassigned: string): string {
  const c = row.projects?.clients;
  if (!c) return unassigned;
  const cl = Array.isArray(c) ? c[0] : c;
  return cl?.name ?? unassigned;
}

function entryAmount(row: ReportEntryRow): number {
  if (!row.is_billable) return 0;
  const rate = Number(row.projects?.hourly_rate ?? 0);
  if (!Number.isFinite(rate)) return 0;
  return (entrySeconds(row) / 3600) * rate;
}

export function buildEntryExportMatrix(
  entries: ReportEntryRow[],
  opts: {
    nameByUserId: Record<string, string>;
    timeZone: string;
    locale: string;
    labels: ReportExportLabels;
    money: Intl.NumberFormat;
  }
): string[][] {
  const { nameByUserId, timeZone, locale, labels, money } = opts;
  const dfLocale = getDateFnsLocale(locale);

  const header = [
    labels.colUser,
    labels.colClient,
    labels.colProject,
    labels.colDescription,
    labels.colStart,
    labels.colEnd,
    labels.colDurationHours,
    labels.colDurationHms,
    labels.colBillable,
    labels.colAmount,
  ];

  const rows = entries.map((row) => {
    const secs = entrySeconds(row);
    const startFmt = formatInTimeZone(
      new Date(row.started_at),
      timeZone,
      DISPLAY_DT,
      { locale: dfLocale }
    );
    const endFmt = row.ended_at
      ? formatInTimeZone(new Date(row.ended_at), timeZone, DISPLAY_DT, {
          locale: dfLocale,
        })
      : "";
    return [
      nameByUserId[row.user_id] ?? row.user_id,
      clientNameFromRow(row, labels.unassignedClient),
      row.projects?.name ?? "",
      row.description ?? "",
      startFmt,
      endFmt,
      secs > 0 ? (secs / 3600).toFixed(2) : "0",
      formatHms(row.duration_seconds),
      row.is_billable ? labels.billableYes : labels.billableNo,
      money.format(entryAmount(row)),
    ];
  });

  return [header, ...rows];
}

export function buildCsvFromMatrix(matrix: string[][]): string {
  const lines = matrix.map((row) =>
    row.map((cell) => csvEscape(String(cell))).join(",")
  );
  return `\uFEFF${lines.join("\n")}`;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildExcelBuffer(
  entries: ReportEntryRow[],
  opts: {
    nameByUserId: Record<string, string>;
    timeZone: string;
    locale: string;
    labels: ReportExportLabels;
    money: Intl.NumberFormat;
    summary: SummaryStats;
    byUser: UserAgg[] | null;
  }
): ArrayBuffer {
  const { labels, money, summary, byUser } = opts;
  const wb = XLSX.utils.book_new();

  const entryMatrix = buildEntryExportMatrix(entries, opts);
  const wsEntries = XLSX.utils.aoa_to_sheet(entryMatrix);
  XLSX.utils.book_append_sheet(wb, wsEntries, labels.sheetEntries);

  const byProject = aggregateByProject(entries);
  const projectHeader = [
    labels.colProject,
    labels.colHours,
    labels.colBillableAmount,
  ];
  const projectRows = byProject.map((p) => [
    p.name,
    formatHours(p.seconds),
    money.format(p.amount),
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([projectHeader, ...projectRows]),
    labels.sheetByProject
  );

  if (byUser && byUser.length > 0) {
    const userHeader = [
      labels.colUser,
      labels.colHours,
      labels.colBillableAmount,
    ];
    const userRows = byUser.map((u) => [
      u.name,
      formatHours(u.seconds),
      money.format(u.amount),
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([userHeader, ...userRows]),
      labels.sheetByUser
    );
  }

  const summaryRows = [
    [labels.summaryTotalHours, formatHours(summary.totalSeconds)],
    [labels.summaryBillableHours, formatHours(summary.billableSeconds)],
    [
      labels.summaryNonBillableHours,
      formatHours(summary.nonBillableSeconds),
    ],
    [labels.summaryBillableAmount, money.format(summary.billableAmount)],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summaryRows),
    labels.sheetSummary
  );

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildExportLabels(
  tr: (key: string) => string
): ReportExportLabels {
  return {
    colUser: tr("colUser"),
    colClient: tr("colClient"),
    colProject: tr("colProject"),
    colDescription: tr("colDescription"),
    colStart: tr("colStart"),
    colEnd: tr("colEnd"),
    colDurationHours: tr("exportColDurationHours"),
    colDurationHms: tr("colDuration"),
    colBillable: tr("colBillable"),
    colAmount: tr("colBillableAmount"),
    billableYes: tr("billableYes"),
    billableNo: tr("billableNo"),
    unassignedClient: tr("unassignedClient"),
    sheetEntries: tr("exportSheetEntries"),
    sheetByProject: tr("exportSheetByProject"),
    sheetByUser: tr("exportSheetByUser"),
    sheetSummary: tr("exportSheetSummary"),
    summaryTotalHours: tr("statTotalHours"),
    summaryBillableHours: tr("statBillableHours"),
    summaryNonBillableHours: tr("statNonBillableHours"),
    summaryBillableAmount: tr("statBillableAmount"),
    colHours: tr("colHours"),
    colBillableAmount: tr("colBillableAmount"),
  };
}
