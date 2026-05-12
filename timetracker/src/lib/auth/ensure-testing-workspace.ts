import { getServiceRoleClient } from "@/lib/supabase/service";

export type EnsureWorkspaceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * If `SUPABASE_SERVICE_ROLE_KEY` is set, assigns the user to the first workspace
 * (creating "My workspace" if needed) as admin.
 */
export async function ensureTestingWorkspaceAccess(
  userId: string
): Promise<EnsureWorkspaceResult> {
  const svc = getServiceRoleClient();
  if (!svc) {
    return {
      ok: false,
      error:
        "Server has no service-role Supabase client (missing or empty SUPABASE_SERVICE_ROLE_KEY at runtime, or missing NEXT_PUBLIC_SUPABASE_URL).",
    };
  }

  const { data: row, error: rowErr } = await svc
    .from("profiles")
    .select("id, workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (rowErr) {
    return { ok: false, error: rowErr.message };
  }

  if (row?.workspace_id) {
    return { ok: true };
  }

  const { data: wsRows, error: wsListErr } = await svc
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (wsListErr) {
    return { ok: false, error: wsListErr.message };
  }

  let wsId = wsRows?.[0]?.id as string | undefined;
  if (!wsId) {
    const { data: inserted, error: wErr } = await svc
      .from("workspaces")
      .insert({ name: "My workspace" })
      .select("id")
      .single();
    if (wErr) {
      return { ok: false, error: wErr.message };
    }
    if (!inserted?.id) {
      return { ok: false, error: "Insert workspace returned no id." };
    }
    wsId = inserted.id as string;
  }

  if (!row) {
    const { error: insErr } = await svc.from("profiles").insert({
      id: userId,
      workspace_id: wsId,
      full_name: "",
      role: "admin",
    });
    if (insErr) {
      return { ok: false, error: insErr.message };
    }
    return { ok: true };
  }

  const { error: upErr } = await svc
    .from("profiles")
    .update({ workspace_id: wsId, role: "admin" })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  return { ok: true };
}
