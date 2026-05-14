import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getWorkspaceDayBoundsUtc } from "@/lib/tracker/day-bounds";
import {
  TrackerView,
  type TrackerEntry,
  type TrackerProject,
} from "@/components/tracker/tracker-view";

export default async function TrackerPage() {
  const { user, profile } = await getWorkspaceContext();
  if (!user?.id || !profile?.workspace_id) {
    await localizedRedirect("/login");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("timezone")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const tz = ws?.timezone ?? "UTC";
  const { startUtc, endExclusiveUtc } = getWorkspaceDayBoundsUtc(tz);

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

  const { data: openRow, error: openErr } = await supabase
    .from("time_entries")
    .select(
      "id, project_id, description, started_at, ended_at, duration_seconds, is_billable"
    )
    .eq("user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const running = openErr ? null : openRow;

  const { data: inRange } = await supabase
    .from("time_entries")
    .select(
      "id, project_id, description, started_at, ended_at, duration_seconds, is_billable"
    )
    .eq("user_id", user.id)
    .gte("started_at", startUtc.toISOString())
    .lt("started_at", endExclusiveUtc.toISOString())
    .order("started_at", { ascending: false });

  const byId = new Map<string, TrackerEntry>();
  for (const row of inRange ?? []) {
    byId.set(row.id, row as TrackerEntry);
  }
  if (running) {
    byId.set(running.id, running as TrackerEntry);
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  return (
    <TrackerView
      userId={user.id}
      workspaceTimezone={tz}
      projects={projects}
      runningEntry={(running as TrackerEntry | null) ?? null}
      entries={merged}
    />
  );
}
