import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getWorkspaceContext,
  isWorkspaceProfileActive,
} from "@/lib/auth/workspace";

export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  const { user, profile } = await getWorkspaceContext();
  if (!user || profile?.role !== "admin" || !profile.workspace_id) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!isWorkspaceProfileActive(profile)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = createClient();

  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", profile.workspace_id);

  if (pErr) {
    return new NextResponse(pErr.message, { status: 500 });
  }

  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) {
    const header = [
      "id",
      "user_id",
      "user_name",
      "project_id",
      "project_name",
      "task_id",
      "description",
      "started_at",
      "ended_at",
      "duration_seconds",
      "is_billable",
      "created_at",
    ].join(",");
    return new NextResponse(header, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="time-entries-empty.csv"',
      },
    });
  }

  const headers = [
    "id",
    "user_id",
    "user_name",
    "project_id",
    "project_name",
    "task_id",
    "description",
    "started_at",
    "ended_at",
    "duration_seconds",
    "is_billable",
    "created_at",
  ];

  const lines: string[] = [headers.join(",")];
  const pageSize = 500;
  let cursor: { started_at: string; id: string } | null = null;

  type Proj = { name: string } | { name: string }[] | null;
  type CsvTimeEntryRow = {
    id: string;
    user_id: string;
    project_id: string;
    task_id: string | null;
    description: string | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    is_billable: boolean;
    created_at: string;
    projects: Proj;
  };

  const projName = (p: Proj): string => {
    if (p == null) return "";
    if (Array.isArray(p)) return p[0]?.name ?? "";
    return p.name ?? "";
  };

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("time_entries")
      .select(
        "id, user_id, project_id, task_id, description, started_at, ended_at, duration_seconds, is_billable, created_at, projects(name)"
      )
      .in("project_id", projectIds);

    if (cursor) {
      const { started_at: sa, id } = cursor;
      q = q.or(`started_at.lt.${sa},and(started_at.eq.${sa},id.lt.${id})`);
    }

    const { data: batch, error: bErr } = await q
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize);

    if (bErr) {
      return new NextResponse(bErr.message, { status: 500 });
    }
    const rows = (batch ?? []) as CsvTimeEntryRow[];
    if (rows.length === 0) break;

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const nameByUser: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const pr of profs ?? []) {
        nameByUser[pr.id] = pr.full_name || "";
      }
    }

    for (const r of rows) {
      const vals = [
        r.id,
        r.user_id,
        nameByUser[r.user_id] ?? "",
        r.project_id,
        projName(r.projects as Proj),
        r.task_id ?? "",
        r.description ?? "",
        r.started_at,
        r.ended_at ?? "",
        r.duration_seconds != null ? String(r.duration_seconds) : "",
        r.is_billable ? "yes" : "no",
        r.created_at,
      ].map((v) => csvEscape(String(v)));
      lines.push(vals.join(","));
    }

    const last = rows[rows.length - 1] as { started_at: string; id: string };
    cursor = { started_at: last.started_at, id: last.id };

    if (rows.length < pageSize) break;
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="workspace-time-entries.csv"',
    },
  });
}
