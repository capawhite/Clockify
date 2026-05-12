import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** Inclusive start, exclusive end in UTC for DB queries. */
export function getWorkspaceDayBoundsUtc(
  timeZone: string,
  instant: Date = new Date()
): { startUtc: Date; endExclusiveUtc: Date } {
  const safeTz = timeZone?.trim() || "UTC";
  try {
    const zoned = toZonedTime(instant, safeTz);
    const startLocal = startOfDay(zoned);
    const endLocal = endOfDay(zoned);
    const startUtc = fromZonedTime(startLocal, safeTz);
    const endUtc = fromZonedTime(endLocal, safeTz);
    return {
      startUtc,
      endExclusiveUtc: new Date(endUtc.getTime() + 1),
    };
  } catch {
    const start = startOfDay(instant);
    const end = endOfDay(instant);
    return {
      startUtc: start,
      endExclusiveUtc: new Date(end.getTime() + 1),
    };
  }
}
