"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import {
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate-localized";
import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { actionFail, type ActionResult } from "@/lib/i18n/action-result";

async function adminErrRedirect(key: string, detail?: string): Promise<never> {
  const q = new URLSearchParams({ err: key });
  if (detail) q.set("d", detail);
  return localizedRedirect(`/admin?${q.toString()}`);
}

async function adminSuccessToast(): Promise<never> {
  return localizedRedirect("/admin?ok=1");
}

async function requireAdmin() {
  const { user, profile } = await getWorkspaceContext();
  if (!user) {
    await adminErrRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!profile) {
    await adminErrRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!profile.workspace_id) {
    await adminErrRedirect("NOT_SIGNED_IN");
    throw new Error("UNREACHABLE");
  }
  if (!isWorkspaceProfileActive(profile)) {
    await localizedRedirect("/login?err=DEACTIVATED");
    throw new Error("UNREACHABLE");
  }
  if (profile.role !== "admin") {
    await adminErrRedirect("ADMIN_ONLY");
    throw new Error("UNREACHABLE");
  }
  return { user, profile, supabase: createClient() };
}

export async function inviteUserByEmail(formData: FormData) {
  await requireAdmin();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await adminErrRedirect("VALID_EMAIL");
    throw new Error("UNREACHABLE");
  }

  const svc = getServiceRoleClient();
  if (!svc) {
    await adminErrRedirect("INVITE_SERVICE");
    throw new Error("UNREACHABLE");
  }

  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const { error } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site}/login`,
  });

  if (error) {
    await adminErrRedirect("GENERIC_WITH_DETAIL", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/team");
  await adminSuccessToast();
}

export async function assignProfileToWorkspaceAdmin(formData: FormData) {
  const { user, profile, supabase } = await requireAdmin();
  const targetId = formData.get("profile_id")?.toString();
  if (!targetId || targetId === user.id) {
    await adminErrRedirect("INVALID_TEAMMATE_ADMIN");
    throw new Error("UNREACHABLE");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      workspace_id: profile.workspace_id,
      role: "member",
    })
    .eq("id", targetId)
    .is("workspace_id", null);

  if (error) {
    await adminErrRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/team");
  await adminSuccessToast();
}

export async function updateMemberRole(formData: FormData) {
  const { user, profile, supabase } = await requireAdmin();
  const targetId = formData.get("profile_id")?.toString();
  const role = formData.get("role")?.toString();
  if (!targetId || !role) {
    await adminErrRedirect("MISSING_PROFILE_ROLE");
    throw new Error("UNREACHABLE");
  }
  if (!["admin", "manager", "member"].includes(role)) {
    await adminErrRedirect("INVALID_ROLE");
    throw new Error("UNREACHABLE");
  }

  if (targetId === user.id && role !== "admin") {
    const { data: admins, error: cErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("role", "admin")
      .eq("is_active", true);

    if (cErr) {
      await adminErrRedirect("DB_ERROR", cErr.message);
      throw new Error("UNREACHABLE");
    }
    if ((admins ?? []).length <= 1) {
      await adminErrRedirect("ONLY_ACTIVE_ADMIN");
      throw new Error("UNREACHABLE");
    }
  }

  const { data: target, error: findErr } = await supabase
    .from("profiles")
    .select("id, workspace_id")
    .eq("id", targetId)
    .maybeSingle();

  if (
    findErr ||
    !target?.workspace_id ||
    target.workspace_id !== profile.workspace_id
  ) {
    await adminErrRedirect("USER_NOT_IN_WS");
    throw new Error("UNREACHABLE");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", targetId)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    await adminErrRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/dashboard");
  await adminSuccessToast();
}

export async function setProfileActive(
  profileId: string,
  is_active: boolean
): Promise<ActionResult> {
  const { user, profile, supabase } = await requireAdmin();

  if (profileId === user.id) {
    return actionFail("CANNOT_DEACTIVATE_SELF");
  }

  const { data: target, error: findErr } = await supabase
    .from("profiles")
    .select("id, workspace_id, role, is_active")
    .eq("id", profileId)
    .maybeSingle();

  if (
    findErr ||
    !target?.workspace_id ||
    target.workspace_id !== profile.workspace_id
  ) {
    return actionFail("USER_NOT_IN_WORKSPACE");
  }

  if (!is_active && target.role === "admin") {
    const { data: admins, error: cErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("role", "admin")
      .eq("is_active", true);

    if (cErr) {
      return actionFail("DB_ERROR", { detail: cErr.message });
    }
    const otherActiveAdmins = (admins ?? []).filter((a) => a.id !== profileId);
    if (otherActiveAdmins.length === 0) {
      return actionFail("PROMOTE_ADMIN_FIRST");
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active })
    .eq("id", profileId)
    .eq("workspace_id", profile.workspace_id);

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }

  revalidateLocalizedPath("/admin");
  return { ok: true };
}

export async function updateWorkspaceSettings(formData: FormData) {
  const { profile, supabase } = await requireAdmin();
  const name = formData.get("name")?.toString().trim();
  const timezone = formData.get("timezone")?.toString().trim() || "UTC";
  const week_starts_on = formData.get("week_starts_on")?.toString();
  const currency = formData.get("currency")?.toString().trim().toUpperCase() || "EUR";

  if (!name) {
    await adminErrRedirect("WORKSPACE_NAME_REQUIRED");
    throw new Error("UNREACHABLE");
  }
  if (week_starts_on !== "mon" && week_starts_on !== "sun") {
    await adminErrRedirect("WEEK_START_INVALID");
    throw new Error("UNREACHABLE");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    await adminErrRedirect("CURRENCY_INVALID");
    throw new Error("UNREACHABLE");
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      name,
      timezone,
      week_starts_on,
      currency,
    })
    .eq("id", profile.workspace_id);

  if (error) {
    await adminErrRedirect("DB_ERROR", error.message);
    throw new Error("UNREACHABLE");
  }

  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  revalidateLocalizedPath("/tracker");
  await adminSuccessToast();
}

export type { ActionResult } from "@/lib/i18n/action-result";
