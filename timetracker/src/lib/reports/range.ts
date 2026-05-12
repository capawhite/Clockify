import {
  lastDayOfMonth,
  startOfMonth,
  subDays,
} from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

export type BillableFilterParam = "all" | "yes" | "no";
export type ReportTabParam =
  | "summary"
  | "by-project"
  | "by-user"
  | "detailed";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(s: string): boolean {
  if (!YMD.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Inclusive calendar start of `ymd` in `timeZone`, as UTC instant. */
export function zonedYmdStartUtc(ymd: string, timeZone: string): Date {
  return toDate(`${ymd}T00:00:00`, { timeZone });
}

/** Inclusive calendar end of `ymd` in `timeZone` → first instant after that day (for range queries). */
export function zonedYmdEndExclusiveUtc(ymd: string, timeZone: string): Date {
  const endOfDay = toDate(`${ymd}T23:59:59.999`, { timeZone });
  return new Date(endOfDay.getTime() + 1);
}

export function todayYmdInTz(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function defaultRangeYmd(timeZone: string, now = new Date()) {
  const to = todayYmdInTz(timeZone, now);
  const toStart = zonedYmdStartUtc(to, timeZone);
  const fromStart = subDays(toStart, 29);
  const from = formatInTimeZone(fromStart, timeZone, "yyyy-MM-dd");
  return { from, to };
}

function addCalendarDaysYmd(ymd: string, timeZone: string, delta: number): string {
  const anchor = toDate(`${ymd}T12:00:00`, { timeZone });
  const next = new Date(anchor.getTime() + delta * 86_400_000);
  return formatInTimeZone(next, timeZone, "yyyy-MM-dd");
}

/** ISO weekday in `timeZone` at noon on `ymd`: 1 = Monday … 7 = Sunday. */
function isoWeekdayAtYmd(ymd: string, timeZone: string): number {
  const noon = toDate(`${ymd}T12:00:00`, { timeZone });
  return Number.parseInt(formatInTimeZone(noon, timeZone, "i"), 10);
}

function startOfWeekYmd(
  ymd: string,
  timeZone: string,
  weekStartsOn: "mon" | "sun"
): string {
  const dow = isoWeekdayAtYmd(ymd, timeZone);
  let offset: number;
  if (weekStartsOn === "mon") {
    offset = dow === 7 ? -6 : -(dow - 1);
  } else {
    offset = dow === 7 ? 0 : -dow;
  }
  return addCalendarDaysYmd(ymd, timeZone, offset);
}

export function presetRangeYmd(
  preset: "this_week" | "last_week" | "this_month" | "last_30",
  timeZone: string,
  weekStartsOn: "mon" | "sun",
  now = new Date()
): { from: string; to: string } {
  const today = todayYmdInTz(timeZone, now);
  if (preset === "last_30") {
    return defaultRangeYmd(timeZone, now);
  }
  if (preset === "this_month") {
    const ref = toDate(`${today}T12:00:00`, { timeZone });
    const from = formatInTimeZone(startOfMonth(ref), timeZone, "yyyy-MM-dd");
    const to = formatInTimeZone(lastDayOfMonth(ref), timeZone, "yyyy-MM-dd");
    return { from, to };
  }
  const weekStart = startOfWeekYmd(today, timeZone, weekStartsOn);
  if (preset === "this_week") {
    return { from: weekStart, to: addCalendarDaysYmd(weekStart, timeZone, 6) };
  }
  const lastWeekEnd = addCalendarDaysYmd(weekStart, timeZone, -1);
  const lastWeekStart = addCalendarDaysYmd(lastWeekEnd, timeZone, -6);
  return { from: lastWeekStart, to: lastWeekEnd };
}

export function parseBillableFilter(
  raw: string | undefined
): BillableFilterParam {
  if (raw === "yes" || raw === "no") return raw;
  return "all";
}

export function parseTab(
  raw: string | undefined,
  canSeeByUser: boolean
): ReportTabParam {
  if (raw === "by-project" || raw === "detailed") return raw;
  if (raw === "by-user" && canSeeByUser) return "by-user";
  if (raw === "by-user") return "summary";
  if (raw === "summary") return "summary";
  return "summary";
}
