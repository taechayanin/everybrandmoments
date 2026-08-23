// Organization-local time semantics (Step-3 review item 3, Step-4 fix 1).
//
// Persistence contract: timestamps are stored as UTC ISO strings. User input
// arrives as org-local wall time ("YYYY-MM-DDTHH:mm" from the composer) and
// is converted explicitly against the organization timezone — never via the
// browser's or server's implicit zone. Display converts UTC back to
// org-local. WORK-DAY boundaries (Overdue / Due Today / Upcoming) also use
// the org zone.
//
// MVP: one org, fixed zone. Sprint 7 moves the zone onto the organization
// record; every caller goes through these helpers, so that becomes a data
// change, not a code change.

export const ORG_TIMEZONE = "Asia/Bangkok";

/** ISO date (YYYY-MM-DD) of the given instant in the organization's zone. */
export function orgLocalDate(instant: Date, timeZone: string = ORG_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Zone offset (ms east of UTC) of `timeZone` at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUtc - instant.getTime();
}

const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Normalize a datetime input to a UTC ISO string.
 * - Naive wall time ("2026-08-23T13:15") → interpreted in the org timezone.
 * - Values carrying an explicit zone (Z / ±hh:mm) → converted as-is.
 * Throws on unparseable input (zod validates shape before this runs).
 */
export function orgLocalToUtcIso(value: string, timeZone: string = ORG_TIMEZONE): string {
  const m = NAIVE_DATETIME.exec(value);
  if (!m) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid datetime: ${value}`);
    }
    return parsed.toISOString();
  }
  const naiveUtc = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  );
  // Two passes converge across DST edges; exact for fixed-offset zones.
  let instant = naiveUtc - tzOffsetMs(new Date(naiveUtc), timeZone);
  instant = naiveUtc - tzOffsetMs(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}

/** UTC ISO → org-local "YYYY-MM-DDTHH:mm" (edit-form round trip). */
export function utcToOrgLocalInput(iso: string, timeZone: string = ORG_TIMEZONE): string {
  const instant = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
