import type { ReportEntryRow } from "@/lib/reports/aggregate";

const PAGE = 500;
export const REPORTS_FETCH_MAX_ROWS = 50_000;

export type FetchReportEntriesResult = {
  entries: ReportEntryRow[];
  truncated: boolean;
};

function normalizeEmbeddedProject(
  raw: ReportEntryRow["projects"] | ReportEntryRow["projects"][] | undefined
): ReportEntryRow["projects"] {
  const row = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  if (!row) return null;
  const c = row.clients;
  const clients = Array.isArray(c) ? c[0] ?? null : c ?? null;
  return { ...row, clients };
}

function normalizeRow(row: {
  id: string;
  user_id: string;
  project_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  is_billable: boolean;
  projects: ReportEntryRow["projects"] | ReportEntryRow["projects"][];
}): ReportEntryRow {
  const p = row.projects;
  const projects = normalizeEmbeddedProject(p);
  return { ...row, projects };
}

/**
 * Fetches matching time_entries with keyset pagination (stable under concurrent writes).
 * `buildBase` must return a select query with all filters except cursor, order, and limit.
 */
export async function fetchReportEntriesForRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildBase: () => any
): Promise<FetchReportEntriesResult> {
  const collected: ReportEntryRow[] = [];
  let truncated = false;
  let cursor: { started_at: string; id: string } | null = null;

  for (;;) {
    if (collected.length >= REPORTS_FETCH_MAX_ROWS) {
      truncated = true;
      break;
    }
    const remaining = REPORTS_FETCH_MAX_ROWS - collected.length;
    const limit = Math.min(PAGE, remaining);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = buildBase();
    if (cursor) {
      const { started_at: sa, id } = cursor;
      q = q.or(`started_at.lt.${sa},and(started_at.eq.${sa},id.lt.${id})`);
    }

    const { data: batch, error } = await q
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }
    const rows = batch ?? [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      collected.push(
        normalizeRow(row as Parameters<typeof normalizeRow>[0])
      );
    }

    const last = rows[rows.length - 1] as { started_at: string; id: string };
    cursor = { started_at: last.started_at, id: last.id };

    if (rows.length < limit) {
      break;
    }
  }

  return { entries: collected, truncated };
}
