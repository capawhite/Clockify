import { localizedRedirect } from "@/lib/i18n/server-redirect";
import {
  canViewWorkspaceReports,
  getWorkspaceContext,
} from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateByProject,
  aggregateByUser,
  summarizeEntries,
} from "@/lib/reports/aggregate";
import {
  defaultRangeYmd,
  isValidYmd,
  parseBillableFilter,
  parseTab,
  zonedYmdEndExclusiveUtc,
  zonedYmdStartUtc,
} from "@/lib/reports/range";
import { fetchReportEntriesForRange } from "@/lib/reports/fetch-entries";
import { ReportsView } from "@/components/reports/reports-view";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function ReportsPage({
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
    .select("timezone, week_starts_on, currency")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const timeZone = ws?.timezone?.trim() || "UTC";
  const weekStartsOn = ws?.week_starts_on === "sun" ? "sun" : "mon";
  const currency = ws?.currency?.trim() || "USD";

  const canFilterTeam = canViewWorkspaceReports(profile.role);

  const defaults = defaultRangeYmd(timeZone);
  const rawFrom = firstString(searchParams.from);
  const rawTo = firstString(searchParams.to);
  let from = rawFrom && isValidYmd(rawFrom) ? rawFrom : defaults.from;
  let to = rawTo && isValidYmd(rawTo) ? rawTo : defaults.to;

  let rangeStart = zonedYmdStartUtc(from, timeZone);
  let rangeEndEx = zonedYmdEndExclusiveUtc(to, timeZone);
  if (rangeStart.getTime() > rangeEndEx.getTime()) {
    from = defaults.from;
    to = defaults.to;
    rangeStart = zonedYmdStartUtc(from, timeZone);
    rangeEndEx = zonedYmdEndExclusiveUtc(to, timeZone);
  }

  const billable = parseBillableFilter(firstString(searchParams.billable));
  const tab = parseTab(firstString(searchParams.tab), canFilterTeam);

  const rawUser = firstString(searchParams.user);
  const userIdFilter =
    canFilterTeam && rawUser && rawUser.length > 0 ? rawUser : null;

  const rawProject = firstString(searchParams.project);
  const projectIdFilter =
    rawProject && rawProject.length > 0 ? rawProject : null;

  const { entries, truncated: reportsTruncated } =
    await fetchReportEntriesForRange(() => {
      let qb = supabase
        .from("time_entries")
        .select(
          `
      id,
      user_id,
      project_id,
      description,
      started_at,
      ended_at,
      duration_seconds,
      is_billable,
      projects ( id, name, color, hourly_rate )
    `
        )
        .lt("started_at", rangeEndEx.toISOString())
        .or(
          `ended_at.is.null,ended_at.gt.${rangeStart.toISOString()}`
        );

      if (!canFilterTeam) {
        qb = qb.eq("user_id", user.id);
      } else if (userIdFilter) {
        qb = qb.eq("user_id", userIdFilter);
      }

      if (projectIdFilter) {
        qb = qb.eq("project_id", projectIdFilter);
      }

      if (billable === "yes") {
        qb = qb.eq("is_billable", true);
      } else if (billable === "no") {
        qb = qb.eq("is_billable", false);
      }

      return qb;
    });

  const { data: projectList } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_archived", false)
    .order("name");

  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("workspace_id", profile.workspace_id)
    .order("full_name");

  const members = memberRows ?? [];
  const nameByUserId: Record<string, string> = {};
  for (const m of members) {
    nameByUserId[m.id] = m.full_name || "Unnamed";
  }

  const summary = summarizeEntries(entries);
  const byProject = aggregateByProject(entries);
  const byUser = canFilterTeam
    ? aggregateByUser(entries, new Map(Object.entries(nameByUserId)))
    : null;

  return (
    <ReportsView
        workspaceTimezone={timeZone}
        weekStartsOn={weekStartsOn}
        currency={currency}
        canFilterTeam={canFilterTeam}
        filters={{
          from,
          to,
          userId: userIdFilter,
          projectId: projectIdFilter,
          billable,
          tab,
        }}
        members={members.map((m) => ({ id: m.id, full_name: m.full_name }))}
        projects={(projectList ?? []).map((p) => ({ id: p.id, name: p.name }))}
        nameByUserId={nameByUserId}
        summary={summary}
        byProject={byProject}
        byUser={byUser}
        detailedRows={entries}
        reportsTruncated={reportsTruncated}
    />
  );
}
