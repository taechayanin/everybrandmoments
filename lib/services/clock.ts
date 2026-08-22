// Clock abstraction (refactor plan §45) — anniversary / 180-day return /
// season / SLA logic must be testable against a fixed date.

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}

  now(): Date {
    return this.value;
  }
}

/** Demo date for the mock dataset — keeps the demo deterministic. */
export const MOCK_TODAY = "2026-08-22";

/**
 * Mock mode pins the clock so KPI cards, SLA and "next 30 days" views are
 * stable. Switch to SystemClock when the D1 adapter becomes the data source.
 */
export function getClock(): Clock {
  return new FixedClock(new Date(MOCK_TODAY));
}
