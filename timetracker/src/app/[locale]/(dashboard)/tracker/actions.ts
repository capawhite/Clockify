"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate-localized";
import { actionFail, type ActionResult } from "@/lib/i18n/action-result";

async function assertProjectInWorkspace(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  projectId: string
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  if (!data) {
    return actionFail("INVALID_PROJECT");
  }
  return { ok: true };
}

export async function startTimer(input: {
  project_id: string;
  description: string;
  is_billable: boolean;
}): Promise<ActionResult> {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile?.workspace_id) {
    return actionFail("NOT_SIGNED_IN");
  }
  if (!isWorkspaceProfileActive(profile)) {
    return actionFail("DEACTIVATED");
  }

  const supabase = createClient();
  const ok = await assertProjectInWorkspace(
    supabase,
    profile.workspace_id,
    input.project_id
  );
  if (!ok.ok) {
    return ok;
  }

  const started_at = new Date().toISOString();

  const { data: existingOpen, error: openFindErr } = await supabase
    .from("time_entries")
    .select("id")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openFindErr) {
    return actionFail("DB_ERROR", { detail: openFindErr.message });
  }
  if (existingOpen) {
    const { error: closeErr } = await supabase
      .from("time_entries")
      .update({ ended_at: started_at })
      .eq("id", existingOpen.id)
      .eq("user_id", user.id)
      .is("ended_at", null);
    if (closeErr) {
      return actionFail("DB_ERROR", { detail: closeErr.message });
    }
  }

  const { error } = await supabase.from("time_entries").insert({
    user_id: user.id,
    project_id: input.project_id,
    description: input.description.trim() || null,
    is_billable: input.is_billable,
    started_at,
    ended_at: null,
  });

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  revalidateLocalizedPath("/tracker");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  return { ok: true };
}

export async function stopTimer(input?: {
  description?: string;
  project_id?: string;
  is_billable?: boolean;
}): Promise<ActionResult> {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile?.workspace_id) {
    return actionFail("NOT_SIGNED_IN");
  }
  if (!isWorkspaceProfileActive(profile)) {
    return actionFail("DEACTIVATED");
  }

  const supabase = createClient();
  const { data: openRow, error: findErr } = await supabase
    .from("time_entries")
    .select("id")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    return actionFail("DB_ERROR", { detail: findErr.message });
  }
  if (!openRow) {
    return actionFail("NO_RUNNING_TIMER");
  }

  if (input?.project_id) {
    const ok = await assertProjectInWorkspace(
      supabase,
      profile.workspace_id,
      input.project_id
    );
    if (!ok.ok) {
      return ok;
    }
  }

  const patch: Record<string, unknown> = {
    ended_at: new Date().toISOString(),
  };
  if (input?.description !== undefined) {
    patch.description = input.description.trim() || null;
  }
  if (input?.project_id) {
    patch.project_id = input.project_id;
  }
  if (input?.is_billable !== undefined) {
    patch.is_billable = input.is_billable;
  }

  const { error } = await supabase
    .from("time_entries")
    .update(patch)
    .eq("id", openRow.id);

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  revalidateLocalizedPath("/tracker");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  return { ok: true };
}

export async function saveManualEntry(input: {
  project_id: string;
  description: string;
  is_billable: boolean;
  started_at: string;
  ended_at: string;
}): Promise<ActionResult> {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile?.workspace_id) {
    return actionFail("NOT_SIGNED_IN");
  }
  if (!isWorkspaceProfileActive(profile)) {
    return actionFail("DEACTIVATED");
  }

  const start = new Date(input.started_at);
  const end = new Date(input.ended_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return actionFail("INVALID_START_OR_END_TIME");
  }
  if (end <= start) {
    return actionFail("END_BEFORE_START");
  }

  const supabase = createClient();
  const ok = await assertProjectInWorkspace(
    supabase,
    profile.workspace_id,
    input.project_id
  );
  if (!ok.ok) {
    return ok;
  }

  const { error } = await supabase.from("time_entries").insert({
    user_id: user.id,
    project_id: input.project_id,
    description: input.description.trim() || null,
    is_billable: input.is_billable,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
  });

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  revalidateLocalizedPath("/tracker");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  return { ok: true };
}

export async function updateTimeEntry(input: {
  id: string;
  project_id: string;
  description: string;
  is_billable: boolean;
  started_at: string;
  ended_at: string | null;
}): Promise<ActionResult> {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile?.workspace_id) {
    return actionFail("NOT_SIGNED_IN");
  }
  if (!isWorkspaceProfileActive(profile)) {
    return actionFail("DEACTIVATED");
  }

  const start = new Date(input.started_at);
  const end = input.ended_at ? new Date(input.ended_at) : null;
  if (Number.isNaN(start.getTime())) {
    return actionFail("INVALID_START_TIME");
  }
  if (end !== null) {
    if (Number.isNaN(end.getTime())) {
      return actionFail("INVALID_END_TIME");
    }
    if (end <= start) {
      return actionFail("END_BEFORE_START");
    }
  }

  const supabase = createClient();
  const projOk = await assertProjectInWorkspace(
    supabase,
    profile.workspace_id,
    input.project_id
  );
  if (!projOk.ok) {
    return projOk;
  }

  const isAdmin = profile.role === "admin";
  let updateQuery = supabase
    .from("time_entries")
    .update({
      project_id: input.project_id,
      description: input.description.trim() || null,
      is_billable: input.is_billable,
      started_at: start.toISOString(),
      ended_at: end ? end.toISOString() : null,
    })
    .eq("id", input.id);

  if (!isAdmin) {
    updateQuery = updateQuery.eq("user_id", user.id);
  }

  const { error } = await updateQuery;

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  revalidateLocalizedPath("/tracker");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  return { ok: true };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const { user, profile } = await getWorkspaceContext();
  if (!user || !profile?.workspace_id) {
    return actionFail("NOT_SIGNED_IN");
  }
  if (!isWorkspaceProfileActive(profile)) {
    return actionFail("DEACTIVATED");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return actionFail("DB_ERROR", { detail: error.message });
  }
  revalidateLocalizedPath("/tracker");
  revalidateLocalizedPath("/dashboard");
  revalidateLocalizedPath("/reports");
  return { ok: true };
}

export type { ActionResult } from "@/lib/i18n/action-result";
