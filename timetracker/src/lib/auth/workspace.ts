import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureTestingWorkspaceAccess } from "@/lib/auth/ensure-testing-workspace";
import { isServiceRoleWorkspaceBootstrapEnabled } from "@/lib/auth/workspace-bootstrap-env";

export type WorkspaceProfile = {
  workspace_id: string | null;
  role: "admin" | "manager" | "member";
  full_name: string;
  is_active: boolean;
};

export type WorkspaceContextResult = {
  user: User | null;
  profile: WorkspaceProfile | null;
  workspaceAssignError?: string | null;
};

export async function getWorkspaceContext(): Promise<WorkspaceContextResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, profile: null };
  }

  const { data: initialProfile, error } = await supabase
    .from("profiles")
    .select("workspace_id, role, full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  let profile = initialProfile;
  let workspaceAssignError: string | null = null;

  if (!profile || !profile.workspace_id) {
    let ensured: Awaited<ReturnType<typeof ensureTestingWorkspaceAccess>>;
    if (!isServiceRoleWorkspaceBootstrapEnabled()) {
      ensured = {
        ok: false,
        error:
          "Service-role workspace bootstrap is disabled (ENABLE_SERVICE_ROLE_WORKSPACE_BOOTSTRAP=false). Apply Supabase migrations in supabase/migrations (see supabase/TESTING_PHASE_CHECKLIST.md) or enable bootstrap.",
      };
    } else {
      ensured = await ensureTestingWorkspaceAccess(user.id);
    }
    if (!ensured.ok) {
      workspaceAssignError = ensured.error;
    }
    const refetch = await supabase
      .from("profiles")
      .select("workspace_id, role, full_name, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (refetch.error) {
      throw new Error(refetch.error.message);
    }
    profile = refetch.data;
    if (
      (!profile || !profile.workspace_id) &&
      ensured.ok &&
      !workspaceAssignError
    ) {
      workspaceAssignError =
        "Workspace was not assigned after bootstrap; run the SQL migration 20260514120000_profiles_update_service_role_bypass.sql in Supabase, or attach your profile manually.";
    }
  }

  return {
    user,
    profile: profile as WorkspaceProfile | null,
    ...(workspaceAssignError
      ? { workspaceAssignError }
      : {}),
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
