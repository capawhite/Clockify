import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackerProject } from "@/components/tracker/tracker-view";

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  client_id: string | null;
  is_billable: boolean;
  clients:
    | { id: string; name: string; default_is_billable?: boolean }[]
    | { id: string; name: string; default_is_billable?: boolean }
    | null;
};

function mapProjectRow(row: ProjectRow): TrackerProject {
  const c = row.clients;
  const clientRow = Array.isArray(c) ? c[0] : c;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    client_id: row.client_id,
    client_name: clientRow?.name ?? null,
    client_default_is_billable:
      typeof clientRow?.default_is_billable === "boolean"
        ? clientRow.default_is_billable
        : null,
    project_is_billable: row.is_billable,
  };
}

const PROJECTS_SELECT_WITH_CLIENT_BILLABLE = `
      id,
      name,
      color,
      client_id,
      is_billable,
      clients ( id, name, default_is_billable )
    `;

const PROJECTS_SELECT_LEGACY = `
      id,
      name,
      color,
      client_id,
      is_billable,
      clients ( id, name )
    `;

/** Active workspace projects for timer/calendar pickers. */
export async function fetchWorkspaceProjectsForPicker(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ projects: TrackerProject[]; error: string | null }> {
  let { data, error } = await supabase
    .from("projects")
    .select(PROJECTS_SELECT_WITH_CLIENT_BILLABLE)
    .eq("workspace_id", workspaceId)
    .eq("is_archived", false)
    .order("name");

  if (
    error?.message?.includes("default_is_billable") ||
    error?.code === "PGRST204"
  ) {
    const fallback = await supabase
      .from("projects")
      .select(PROJECTS_SELECT_LEGACY)
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false)
      .order("name");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { projects: [], error: error.message };
  }

  return {
    projects: (data ?? []).map((row) => mapProjectRow(row as ProjectRow)),
    error: null,
  };
}
