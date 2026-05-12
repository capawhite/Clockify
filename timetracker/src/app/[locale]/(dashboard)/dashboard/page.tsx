import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  presetRangeYmd,
  todayYmdInTz,
  zonedYmdEndExclusiveUtc,
  zonedYmdStartUtc,
} from "@/lib/reports/range";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

type ProjectEmbed = { name: string; color: string | null } | null;

function firstProject(p: unknown): ProjectEmbed {
  if (p == null) return null;
  if (Array.isArray(p)) return (p[0] as ProjectEmbed) ?? null;
  return p as ProjectEmbed;
}

export default async function DashboardPage() {
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

  const timeZone = ws?.timezone?.trim() || "UTC";
  const weekStartsOn = ws?.week_starts_on === "sun" ? "sun" : "mon";

  const todayYmd = todayYmdInTz(timeZone);
  const todayStart = zonedYmdStartUtc(todayYmd, timeZone);
  const todayEndEx = zonedYmdEndExclusiveUtc(todayYmd, timeZone);

  const thisWeek = presetRangeYmd("this_week", timeZone, weekStartsOn);
  const lastWeek = presetRangeYmd("last_week", timeZone, weekStartsOn);
  const twStart = zonedYmdStartUtc(thisWeek.from, timeZone);
  const twEndEx = zonedYmdEndExclusiveUtc(thisWeek.to, timeZone);
  const lwStart = zonedYmdStartUtc(lastWeek.from, timeZone);
  const lwEndEx = zonedYmdEndExclusiveUtc(lastWeek.to, timeZone);

  const uid = user.id;

  const [{ data: todayRows }, { data: twRows }, { data: lwRows }] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("duration_seconds")
        .eq("user_id", uid)
        .not("ended_at", "is", null)
        .gte("started_at", todayStart.toISOString())
        .lt("started_at", todayEndEx.toISOString()),
      supabase
        .from("time_entries")
        .select("duration_seconds, project_id, projects(name, color)")
        .eq("user_id", uid)
        .not("ended_at", "is", null)
        .gte("started_at", twStart.toISOString())
        .lt("started_at", twEndEx.toISOString()),
      supabase
        .from("time_entries")
        .select("duration_seconds")
        .eq("user_id", uid)
        .not("ended_at", "is", null)
        .gte("started_at", lwStart.toISOString())
        .lt("started_at", lwEndEx.toISOString()),
    ]);

  const sumSeconds = (rows: { duration_seconds: number | null }[] | null) =>
    (rows ?? []).reduce((acc, r) => {
      const s = r.duration_seconds;
      return acc + (s != null && Number.isFinite(s) ? Math.max(0, s) : 0);
    }, 0);

  const todaySeconds = sumSeconds(todayRows ?? []);
  const thisWeekSeconds = sumSeconds(
    (twRows ?? []).map((r) => ({ duration_seconds: r.duration_seconds }))
  );
  const lastWeekSeconds = sumSeconds(lwRows ?? []);

  type WeekRow = {
    duration_seconds: number | null;
    project_id: string;
    projects: unknown;
  };
  const projectTotals = new Map<
    string,
    { name: string; color: string; seconds: number }
  >();
  for (const r of (twRows ?? []) as WeekRow[]) {
    const s = r.duration_seconds;
    const sec = s != null && Number.isFinite(s) ? Math.max(0, s) : 0;
    if (sec === 0) continue;
    const proj = firstProject(r.projects);
    const name = proj?.name ?? "Unknown";
    const color = proj?.color ?? "#737373";
    const cur = projectTotals.get(r.project_id) ?? {
      name,
      color,
      seconds: 0,
    };
    cur.seconds += sec;
    cur.name = name;
    cur.color = color;
    projectTotals.set(r.project_id, cur);
  }
  const topProjectsWeek = Array.from(projectTotals.values())
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      color: p.color,
      hours: p.seconds / 3600,
    }));

  const { data: openRow } = await supabase
    .from("time_entries")
    .select(
      "id, description, started_at, project_id, projects(name, color)"
    )
    .eq("user_id", uid)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const openProj = openRow ? firstProject(openRow.projects) : null;
  const running = openRow
    ? {
        id: openRow.id,
        description: openRow.description,
        started_at: openRow.started_at,
        projectName: openProj?.name ?? "Project",
        projectColor: openProj?.color ?? "#737373",
      }
    : null;

  const { data: descRows } = await supabase
    .from("time_entries")
    .select("description, project_id, is_billable, started_at")
    .eq("user_id", uid)
    .not("description", "is", null)
    .neq("description", "")
    .order("started_at", { ascending: false })
    .limit(80);

  const seen = new Set<string>();
  const resumeChips: {
    description: string;
    project_id: string;
    is_billable: boolean;
  }[] = [];
  for (const row of descRows ?? []) {
    const d = (row.description ?? "").trim();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    resumeChips.push({
      description: d,
      project_id: row.project_id,
      is_billable: row.is_billable,
    });
    if (resumeChips.length >= 5) break;
  }

  let teamActivity: {
    userId: string;
    name: string;
    projectName: string;
    started_at: string;
  }[] | null = null;

  if (profile.role === "admin") {
    const { data: openAll } = await supabase
      .from("time_entries")
      .select("user_id, started_at, projects(name)")
      .is("ended_at", null)
      .order("started_at", { ascending: false });

    const rows = openAll ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const nameById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) {
        nameById[p.id] = p.full_name || "Unnamed";
      }
    }
    teamActivity = rows.map((r) => {
      const pn = firstProject(r.projects);
      return {
        userId: r.user_id,
        name: nameById[r.user_id] ?? r.user_id,
        projectName: pn?.name ?? "Project",
        started_at: r.started_at,
      };
    });
  }

  return (
    <DashboardHome
      timezone={timeZone}
      todaySeconds={todaySeconds}
      thisWeekSeconds={thisWeekSeconds}
      lastWeekSeconds={lastWeekSeconds}
      running={running}
      resumeChips={resumeChips}
      topProjectsWeek={topProjectsWeek}
      teamActivity={teamActivity}
      isAdmin={profile.role === "admin"}
    />
  );
}
