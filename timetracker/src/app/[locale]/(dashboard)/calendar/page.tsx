import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  CalendarView,
  type CalendarEntry,
} from "@/components/calendar/calendar-view";
import type { TrackerProject } from "@/components/tracker/tracker-view";

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function ymdDayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function getWeekStartYmd(todayYmd: string, weekStartsOnDay: 0 | 1): string {
  const day = ymdDayOfWeek(todayYmd);
  const diff =
    weekStartsOnDay === 1 ? (day === 0 ? -6 : 1 - day) : -day;
  return addDaysToYmd(todayYmd, diff);
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await getWorkspaceContext();
  if (!user?.id || !profile?.workspace_id) {
    await localizedRedirect("/login");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("timezone, week_starts_on")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const tz = ws?.timezone?.trim() || "UTC";
  const weekStartsOn: 0 | 1 = ws?.week_starts_on === "sun" ? 0 : 1;

  // Compute the week start date (yyyy-MM-dd in workspace timezone)
  const weekParam = firstString(searchParams.week);
  const todayYmd = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  const weekStart =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : getWeekStartYmd(todayYmd, weekStartsOn);

  // Fetch UTC bounds for DB query (7-day range)
  const [wy, wm, wd] = weekStart.split("-").map(Number);
  // Midnight at start of week in workspace TZ → UTC
  // We use the ISO string trick: parse "YYYY-MM-DDT00:00:00" as if in workspace TZ
  const { fromZonedTime } = await import("date-fns-tz");
  const weekStartUtc = fromZonedTime(`${weekStart}T00:00:00`, tz);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: projectRows } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      color,
      client_id,
      is_billable,
      clients ( id, name, default_is_billable )
    `
    )
    .eq("workspace_id", profile.workspace_id)
    .eq("is_archived", false)
    .order("name");

  const projects: TrackerProject[] = (projectRows ?? []).map((row) => {
    const c = row.clients;
    const clientRow = Array.isArray(c) ? c[0] : c;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      client_id: row.client_id,
      client_name: clientRow?.name ?? null,
      client_default_is_billable:
        clientRow?.default_is_billable ?? null,
      project_is_billable: row.is_billable,
    };
  });

  // Fetch entries that overlap the week (started before week end AND ended after week start OR running)
  const { data: entries } = await supabase
    .from("time_entries")
    .select(
      "id, project_id, description, started_at, ended_at, duration_seconds, is_billable"
    )
    .eq("user_id", user.id)
    .lt("started_at", weekEndUtc.toISOString())
    .or(
      `ended_at.is.null,ended_at.gt.${weekStartUtc.toISOString()}`
    )
    .order("started_at", { ascending: true });

  // Suppress unused variable warning (wy, wm, wd used only for type narrowing above)
  void wy; void wm; void wd;

  return (
    <CalendarView
      userId={user.id}
      workspaceTimezone={tz}
      weekStartsOn={weekStartsOn}
      weekStart={weekStart}
      projects={projects}
      entries={(entries ?? []) as CalendarEntry[]}
    />
  );
}
