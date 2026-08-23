// Organization-local time semantics (Step-3 review item 3).
//
// Timestamps persist in UTC; WORK-DAY boundaries (Overdue / Due Today /
// Upcoming) are computed in the organization's local timezone — a task due
// "2026-08-23" is due on the Bangkok 23rd, not the UTC 23rd.
//
// MVP: one org, fixed zone. Sprint 7 moves the zone onto the organization
// record; callers already pass through this helper, so that becomes a data
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
