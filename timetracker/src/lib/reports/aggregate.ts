export type ReportClientEmbed = {
  id: string;
  name: string;
} | null;

export type ReportProjectEmbed = {
  id: string;
  name: string;
  color: string | null;
  hourly_rate: string | number | null;
  client_id: string | null;
  clients: ReportClientEmbed;
};

export type ReportEntryRow = {
  id: string;
  user_id: string;
  project_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  is_billable: boolean;
  projects: ReportProjectEmbed | null;
};

/** Seconds counted for reports (completed segments only). */
export function entrySeconds(e: ReportEntryRow): number {
  if (e.duration_seconds != null && Number.isFinite(e.duration_seconds)) {
    return Math.max(0, e.duration_seconds);
  }
  return 0;
}

function rateToNumber(rate: string | number | null | undefined): number {
  if (rate == null || rate === "") return 0;
  const n = typeof rate === "number" ? rate : Number(rate);
  return Number.isFinite(n) ? n : 0;
}

function entryAmountUsd(e: ReportEntryRow): number {
  if (!e.is_billable) return 0;
  const hrs = entrySeconds(e) / 3600;
  const rate = rateToNumber(e.projects?.hourly_rate ?? null);
  return hrs * rate;
}

export type SummaryStats = {
  totalSeconds: number;
  billableSeconds: number;
  nonBillableSeconds: number;
  billableAmount: number;
};

export function summarizeEntries(rows: ReportEntryRow[]): SummaryStats {
  let totalSeconds = 0;
  let billableSeconds = 0;
  let nonBillableSeconds = 0;
  let billableAmount = 0;
  for (const e of rows) {
    const s = entrySeconds(e);
    if (s === 0) continue;
    totalSeconds += s;
    if (e.is_billable) {
      billableSeconds += s;
      billableAmount += entryAmountUsd(e);
    } else {
      nonBillableSeconds += s;
    }
  }
  return { totalSeconds, billableSeconds, nonBillableSeconds, billableAmount };
}

export type ProjectAgg = {
  projectId: string;
  name: string;
  color: string;
  seconds: number;
  amount: number;
};

export function aggregateByProject(rows: ReportEntryRow[]): ProjectAgg[] {
  const map = new Map<string, ProjectAgg>();
  for (const e of rows) {
    const s = entrySeconds(e);
    if (s === 0) continue;
    const id = e.project_id;
    const name = e.projects?.name ?? "Unknown project";
    const color = e.projects?.color ?? "#737373";
    const cur = map.get(id) ?? {
      projectId: id,
      name,
      color,
      seconds: 0,
      amount: 0,
    };
    cur.seconds += s;
    cur.amount += entryAmountUsd(e);
    cur.name = name;
    cur.color = color;
    map.set(id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
}

export type UserAgg = {
  userId: string;
  name: string;
  seconds: number;
  amount: number;
};

export function aggregateByUser(
  rows: ReportEntryRow[],
  profileNameByUserId: Map<string, string>
): UserAgg[] {
  const map = new Map<string, UserAgg>();
  for (const e of rows) {
    const s = entrySeconds(e);
    if (s === 0) continue;
    const id = e.user_id;
    const name = profileNameByUserId.get(id) ?? "Unknown user";
    const cur = map.get(id) ?? {
      userId: id,
      name,
      seconds: 0,
      amount: 0,
    };
    cur.seconds += s;
    cur.amount += entryAmountUsd(e);
    cur.name = name;
    map.set(id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
}

export type ReportEntryGroup = {
  key: string;
  label: string;
  seconds: number;
  entries: ReportEntryRow[];
};

export function groupEntriesByClient(
  rows: ReportEntryRow[],
  unassignedLabel: string
): ReportEntryGroup[] {
  const map = new Map<string, { label: string; entries: ReportEntryRow[] }>();
  for (const e of rows) {
    const s = entrySeconds(e);
    if (s === 0) continue;
    const client = e.projects?.clients;
    const key = client?.id ?? "__none__";
    const label = client?.name ?? unassignedLabel;
    const cur = map.get(key) ?? { label, entries: [] };
    cur.entries.push(e);
    map.set(key, cur);
  }
  const groups: ReportEntryGroup[] = [];
  map.forEach((v, key) => {
    let seconds = 0;
    for (const x of v.entries) {
      seconds += entrySeconds(x);
    }
    v.entries.sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
    groups.push({ key, label: v.label, seconds, entries: v.entries });
  });
  return groups.sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.label.localeCompare(b.label);
  });
}

export function groupEntriesByProject(rows: ReportEntryRow[]): ReportEntryGroup[] {
  const map = new Map<string, { label: string; entries: ReportEntryRow[] }>();
  for (const e of rows) {
    const s = entrySeconds(e);
    if (s === 0) continue;
    const key = e.project_id;
    const label = e.projects?.name ?? "Unknown project";
    const cur = map.get(key) ?? { label, entries: [] };
    cur.entries.push(e);
    map.set(key, cur);
  }
  const groups: ReportEntryGroup[] = [];
  map.forEach((v, key) => {
    let seconds = 0;
    for (const x of v.entries) {
      seconds += entrySeconds(x);
    }
    v.entries.sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
    groups.push({ key, label: v.label, seconds, entries: v.entries });
  });
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

export function formatHours(seconds: number, fractionDigits = 2): string {
  return (seconds / 3600).toFixed(fractionDigits);
}
