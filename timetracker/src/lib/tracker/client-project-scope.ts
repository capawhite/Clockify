/** URL-safe sentinel values for the tracker/calendar client filter (never collide with UUIDs). */
export type ClientScope = "__all__" | "__unassigned__" | string;

export function filterProjectsByClientScope<
  T extends { client_id: string | null },
>(projects: T[], scope: ClientScope): T[] {
  if (scope === "__all__") return projects;
  if (scope === "__unassigned__") {
    return projects.filter((p) => p.client_id == null);
  }
  return projects.filter((p) => p.client_id === scope);
}

export function uniqueClientsFromProjects<
  T extends { client_id: string | null; client_name: string | null },
>(projects: T[]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const p of projects) {
    if (p.client_id && p.client_name) {
      m.set(p.client_id, p.client_name);
    }
  }
  return Array.from(m.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveBillableDefaultForProject(p: {
  client_id: string | null;
  client_default_is_billable: boolean | null;
  project_is_billable: boolean;
}): boolean {
  if (
    p.client_id != null &&
    typeof p.client_default_is_billable === "boolean"
  ) {
    return p.client_default_is_billable;
  }
  return p.project_is_billable;
}
