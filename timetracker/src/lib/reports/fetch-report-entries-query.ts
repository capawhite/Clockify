import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceProfile } from "@/lib/auth/workspace";
import { canViewWorkspaceReports } from "@/lib/auth/workspace";
import {
  defaultRangeYmd,
  isValidYmd,
  parseBillableFilter,
  zonedYmdEndExclusiveUtc,
  zonedYmdStartUtc,
  type BillableFilterParam,
} from "@/lib/reports/range";
import { fetchReportEntriesForRange } from "@/lib/reports/fetch-entries";

export type ReportQueryParams = {
  from: string;
  to: string;
  userId: string | null;
  projectId: string | null;
  billable: BillableFilterParam;
};

export type FetchedReportData = {
  params: ReportQueryParams;
  timeZone: string;
  currency: string;
  canFilterTeam: boolean;
  entries: Awaited<ReturnType<typeof fetchReportEntriesForRange>>["entries"];
  truncated: boolean;
  nameByUserId: Record<string, string>;
};

export function parseReportQueryParams(
  searchParams: {
    from?: string;
    to?: string;
    user?: string;
    project?: string;
    billable?: string;
  },
  timeZone: string,
  canFilterTeam: boolean
): ReportQueryParams {
  const defaults = defaultRangeYmd(timeZone);
  let from =
    searchParams.from && isValidYmd(searchParams.from)
      ? searchParams.from
      : defaults.from;
  let to =
    searchParams.to && isValidYmd(searchParams.to)
      ? searchParams.to
      : defaults.to;

  let rangeStart = zonedYmdStartUtc(from, timeZone);
  let rangeEndEx = zonedYmdEndExclusiveUtc(to, timeZone);
  if (rangeStart.getTime() > rangeEndEx.getTime()) {
    from = defaults.from;
    to = defaults.to;
    rangeStart = zonedYmdStartUtc(from, timeZone);
    rangeEndEx = zonedYmdEndExclusiveUtc(to, timeZone);
  }

  const billable = parseBillableFilter(searchParams.billable);
  const userIdFilter =
    canFilterTeam && searchParams.user && searchParams.user.length > 0
      ? searchParams.user
      : null;
  const projectIdFilter =
    searchParams.project && searchParams.project.length > 0
      ? searchParams.project
      : null;

  return {
    from,
    to,
    userId: canFilterTeam ? userIdFilter : null,
    projectId: projectIdFilter,
    billable,
  };
}

export async function fetchReportData(
  supabase: SupabaseClient,
  user: User,
  profile: WorkspaceProfile & { workspace_id: string },
  searchParams: {
    from?: string;
    to?: string;
    user?: string;
    project?: string;
    billable?: string;
  }
): Promise<FetchedReportData> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("timezone, currency")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const timeZone = ws?.timezone?.trim() || "UTC";
  const currency = ws?.currency?.trim() || "EUR";
  const canFilterTeam = canViewWorkspaceReports(profile.role);

  const params = parseReportQueryParams(searchParams, timeZone, canFilterTeam);

  const rangeStart = zonedYmdStartUtc(params.from, timeZone);
  const rangeEndEx = zonedYmdEndExclusiveUtc(params.to, timeZone);

  const { entries, truncated } = await fetchReportEntriesForRange(() => {
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
      projects (
        id,
        name,
        color,
        hourly_rate,
        client_id,
        clients ( id, name )
      )
    `
      )
      .lt("started_at", rangeEndEx.toISOString())
      .or(`ended_at.is.null,ended_at.gt.${rangeStart.toISOString()}`);

    if (!canFilterTeam) {
      qb = qb.eq("user_id", user.id);
    } else if (params.userId) {
      qb = qb.eq("user_id", params.userId);
    }

    if (params.projectId) {
      qb = qb.eq("project_id", params.projectId);
    }

    if (params.billable === "yes") {
      qb = qb.eq("is_billable", true);
    } else if (params.billable === "no") {
      qb = qb.eq("is_billable", false);
    }

    return qb;
  });

  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("workspace_id", profile.workspace_id)
    .order("full_name");

  const nameByUserId: Record<string, string> = {};
  for (const m of memberRows ?? []) {
    nameByUserId[m.id] = m.full_name || "Unnamed";
  }

  return {
    params,
    timeZone,
    currency,
    canFilterTeam,
    entries,
    truncated,
    nameByUserId,
  };
}
