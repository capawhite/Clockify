"use server";

import { createClient } from "@/lib/supabase/server";
import {
  canManageProjects,
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate-localized";
import { localizedRedirect } from "@/lib/i18n/server-redirect";

async function errRedirect(
  path: "/clients",
  key: string,
  detail?: string
): Promise<never> {
  const q = new URLSearchParams({ err: key });
  if (detail) q.set("d", detail);
  return localizedRedirect(`${path}?${q.toString()}`);
}

export async function createWorkspaceClient(formData: FormData) {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile || !profile.workspace_id) {
    await errRedirect("/clients", "NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!canManageProjects(profile.role)) {
    await errRedirect("/clients", "CLIENTS_FORBIDDEN");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await errRedirect("/clients", "DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  const name = formData.get("name")?.toString().trim();
  const color = formData.get("color")?.toString().trim() || "#6366f1";
  if (!name) {
    await errRedirect("/clients", "CLIENT_NAME_REQUIRED");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const { error } = await supabase.from("clients").insert({
    workspace_id: profile.workspace_id,
    name,
    color,
  });

  if (error) {
    await errRedirect("/clients", "DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/clients");
  revalidateLocalizedPath("/projects");
  await localizedRedirect("/clients");
}

export async function deleteWorkspaceClient(formData: FormData) {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile || !profile.workspace_id) {
    await errRedirect("/clients", "NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (profile.role !== "admin") {
    await errRedirect("/clients", "ONLY_ADMIN_DELETE_CLIENT");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await errRedirect("/clients", "DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  const id = formData.get("id")?.toString();
  if (!id) {
    await errRedirect("/clients", "MISSING_CLIENT_ID");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    await errRedirect("/clients", "DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/clients");
  revalidateLocalizedPath("/projects");
  await localizedRedirect("/clients");
}
