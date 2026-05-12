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

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, color")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_archived", false)
    .order("name");

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
      projects={(projects ?? []) as TrackerProject[]}
      runningEntry={(running as TrackerEntry | null) ?? null}
      entries={merged}
    />
  );
}
