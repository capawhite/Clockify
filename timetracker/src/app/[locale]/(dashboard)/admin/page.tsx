import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { AdminPanel } from "@/components/admin/admin-panel";
import { translateFlashError } from "@/lib/i18n/flash-error";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await getWorkspaceContext();
  if (!user?.id || !profile?.workspace_id || profile.role !== "admin") {
    await localizedRedirect("/dashboard");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const wsId = profile.workspace_id;

  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, timezone, week_starts_on, currency")
    .eq("id", wsId)
    .single();

  if (wsErr || !workspace) {
    throw new Error(wsErr?.message ?? "Workspace not found");
  }

  const { data: allProfiles, error: listErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, workspace_id, is_active, created_at")
    .order("created_at", { ascending: true });

  if (listErr) {
    throw new Error(listErr.message);
  }

  const rows = allProfiles ?? [];
  const pending = rows.filter((p) => p.workspace_id === null);
  const members = rows
    .filter((p) => p.workspace_id === wsId)
    .sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, {
        sensitivity: "base",
      })
    );

  let timezones: string[] = ["UTC"];
  try {
    timezones = Intl.supportedValuesOf("timeZone");
  } catch {
    timezones = ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
  }

  const invitesConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const flashError = await translateFlashError(
    firstString(searchParams.err),
    firstString(searchParams.d)
  );
  const flashOk =
    firstString(searchParams.ok) === "1" ||
    firstString(searchParams.ok) === "true";

  return (
    <AdminPanel
      workspace={workspace}
      pending={pending}
      members={members}
      currentUserId={user.id}
      timezones={timezones}
      invitesConfigured={invitesConfigured}
      flashError={flashError}
      flashOk={flashOk}
    />
  );
}
