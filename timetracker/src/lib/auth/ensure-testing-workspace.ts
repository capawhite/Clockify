import { getServiceRoleClient } from "@/lib/supabase/service";

/**
 * If `SUPABASE_SERVICE_ROLE_KEY` is set, assigns the user to the first workspace
 * (creating "My workspace" if needed) as admin. Lets a solo tester use the app
 * without running manual SQL when the DB trigger left `workspace_id` null.
 */
export async function ensureTestingWorkspaceAccess(userId: string): Promise<void> {
  const svc = getServiceRoleClient();
  if (!svc) return;

  const { data: row } = await svc
    .from("profiles")
    .select("id, workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (row?.workspace_id) return;

  const { data: wsRows } = await svc
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  let wsId = wsRows?.[0]?.id as string | undefined;
  if (!wsId) {
    const { data: inserted, error: wErr } = await svc
      .from("workspaces")
      .insert({ name: "My workspace" })
      .select("id")
      .single();
    if (wErr || !inserted?.id) return;
    wsId = inserted.id as string;
  }

  if (!row) {
    await svc.from("profiles").insert({
      id: userId,
      workspace_id: wsId,
      full_name: "",
      role: "admin",
    });
    return;
  }

  await svc
    .from("profiles")
    .update({ workspace_id: wsId, role: "admin" })
    .eq("id", userId);
}
