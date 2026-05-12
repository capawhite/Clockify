"use server";

import { createClient } from "@/lib/supabase/server";
import {
  canManageProjects,
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate-localized";
import { localizedRedirect } from "@/lib/i18n/server-redirect";

async function errRedirect(key: string, detail?: string): Promise<never> {
  const q = new URLSearchParams({ err: key });
  if (detail) q.set("d", detail);
  return localizedRedirect(`/projects?${q.toString()}`);
}

export async function createProject(formData: FormData) {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile || !profile.workspace_id) {
    await errRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!canManageProjects(profile.role)) {
    await errRedirect("PROJECTS_FORBIDDEN");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await errRedirect("DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  const name = formData.get("name")?.toString().trim();
  const color = formData.get("color")?.toString().trim() || "#6366f1";
  const clientIdRaw = formData.get("client_id")?.toString().trim();
  const client_id = clientIdRaw && clientIdRaw.length > 0 ? clientIdRaw : null;
  const is_billable = formData.get("is_billable") === "on";
  const rateRaw = formData.get("hourly_rate")?.toString().trim();
  const hourly_rate =
    rateRaw && rateRaw.length > 0 ? Number.parseFloat(rateRaw) : null;

  if (!name) {
    await errRedirect("PROJECT_NAME_REQUIRED");
    throw new Error("UNREACHABLE");
  }
  if (hourly_rate !== null && Number.isNaN(hourly_rate)) {
    await errRedirect("HOURLY_RATE_NAN");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  if (client_id) {
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();
    if (clientErr) {
      await errRedirect("DB_ERROR", clientErr.message);
      throw new Error("UNREACHABLE");
    }
    if (!clientRow) {
      await errRedirect("INVALID_CLIENT");
      throw new Error("UNREACHABLE");
    }
  }

  const { error } = await supabase.from("projects").insert({
    workspace_id: profile.workspace_id,
    client_id,
    name,
    color,
    is_billable,
    hourly_rate,
  });

  if (error) {
    await errRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/projects");
  await localizedRedirect("/projects?toast=created");
}

export async function setProjectArchived(formData: FormData) {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile || !profile.workspace_id) {
    await errRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!canManageProjects(profile.role)) {
    await errRedirect("PROJECT_ARCHIVE_FORBIDDEN");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await errRedirect("DEACTIVATED");
    throw new Error("UNREACHABLE");
  }

  const id = formData.get("id")?.toString();
  const nextArchived = formData.get("archived") === "true";
  if (!id) {
    await errRedirect("MISSING_PROJECT_ID");
    throw new Error("UNREACHABLE");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .update({ is_archived: nextArchived })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    await errRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/projects");
  await localizedRedirect("/projects");
}
