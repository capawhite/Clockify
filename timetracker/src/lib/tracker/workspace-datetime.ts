import { formatInTimeZone, toDate } from "date-fns-tz";

/** Workspace wall-clock date + time for `<input type="date">` / `<input type="time">`. */
export function workspaceNowDateAndTime(timeZone: string): {
  date: string;
  time: string;
} {
  const tz = timeZone?.trim() || "UTC";
  const now = new Date();
  return {
    date: formatInTimeZone(now, tz, "yyyy-MM-dd"),
    time: formatInTimeZone(now, tz, "HH:mm"),
  };
}

/** Combine workspace-local date (yyyy-MM-dd) and time (HH:mm) to UTC ISO. */
export function workspaceDateAndTimeToUtcIso(
  dateYmd: string,
  timeHm: string,
  timeZone: string
): string | null {
  const d = dateYmd.trim();
  const t = timeHm.trim();
  if (!d || !t) return null;
  const withSecs = t.length === 5 ? `${t}:00` : t;
  return workspaceDatetimeLocalToUtcIso(`${d}T${withSecs}`, timeZone);
}

/** Workspace wall-clock date (yyyy-MM-dd) + time (HH:mm) for an instant. */
export function utcIsoToWorkspaceDateAndTime(
  iso: string,
  timeZone: string
): { date: string; time: string } {
  const tz = timeZone?.trim() || "UTC";
  return {
    date: formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd"),
    time: formatInTimeZone(new Date(iso), tz, "HH:mm"),
  };
}

/** Format an instant for `<input type="datetime-local">` in a workspace IANA zone. */
export function utcIsoToWorkspaceDatetimeLocal(
  iso: string,
  timeZone: string
): string {
  const safeTz = timeZone?.trim() || "UTC";
  return formatInTimeZone(new Date(iso), safeTz, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Parses `datetime-local` value (yyyy-MM-ddTHH:mm or with seconds) as wall time
 * in the workspace IANA timezone, returns UTC ISO string.
 */
export function workspaceDatetimeLocalToUtcIso(
  localValue: string,
  timeZone: string
): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) {
    return null;
  }
  const withSeconds =
    trimmed.length === 16
      ? `${trimmed}:00`
      : trimmed.length === 19
        ? trimmed
        : trimmed;
  try {
    const safeTz = timeZone?.trim() || "UTC";
    const d = toDate(withSeconds.replace(" ", "T"), { timeZone: safeTz });
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d.toISOString();
  } catch {
    return null;
  }
}
