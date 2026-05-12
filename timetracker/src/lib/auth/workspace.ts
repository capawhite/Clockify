import { createClient } from "@/lib/supabase/server";

export type WorkspaceProfile = {
  workspace_id: string | null;
  role: "admin" | "manager" | "member";
  full_name: string;
  is_active: boolean;
};

export async function getWorkspaceContext() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null as null, profile: null as null };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("workspace_id, role, full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    user,
    profile: profile as WorkspaceProfile | null,
  };
}

/** False when admin has deactivated this profile (app + API should gate on this). */
export function isWorkspaceProfileActive(
  profile: WorkspaceProfile | null | undefined
): boolean {
  if (!profile) return false;
  return profile.is_active !== false;
}

export function canManageProjects(role: string | undefined) {
  return role === "admin" || role === "manager";
}

/** Admins and managers can see all workspace time entries in reports. */
export function canViewWorkspaceReports(role: string | undefined) {
  return role === "admin" || role === "manager";
}
