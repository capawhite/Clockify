"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext, isWorkspaceProfileActive } from "@/lib/auth/workspace";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate-localized";
import { localizedRedirect } from "@/lib/i18n/server-redirect";

async function errRedirect(key: string, detail?: string): Promise<never> {
  const q = new URLSearchParams({ err: key });
  if (detail) q.set("d", detail);
  return localizedRedirect(`/team?${q.toString()}`);
}

export async function assignProfileToWorkspace(formData: FormData) {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile || !profile.workspace_id) {
    await errRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (profile.role !== "admin") {
    await errRedirect("TEAM_FORBIDDEN");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await errRedirect("DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  const targetId = formData.get("profile_id")?.toString();
  if (!targetId || targetId === user.id) {
    await errRedirect("INVALID_TEAMMATE");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      workspace_id: profile.workspace_id,
      role: "member",
    })
    .eq("id", targetId)
    .is("workspace_id", null);

  if (error) {
    await errRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/team");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/");
  await localizedRedirect("/team");
}
