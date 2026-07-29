/**
 * utils/bookingTime.ts
 * Shared helpers for computing + validating booking times.
 *
 * Event times are stored as "HH:MM" strings (24-hour). If end < start we
 * assume the event wraps past midnight (e.g. 22:00 → 02:00).
 */

/** Parse a "HH:MM" string into minutes since midnight. Returns null if invalid. */
export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Compute duration in hours (rounded to nearest 0.5) between two HH:MM strings.
 * If end is the same as or before start, assume end is on the next day
 * (end - start + 24h). Returns 0 if either is unparseable.
 */
export function computeDurationHours(startTime?: string, endTime?: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60; // wrap past midnight
  return Math.round((diff / 60) * 2) / 2;
}

/**
 * Validate a booking's times. Returns a list of human-readable errors
 * (empty array means the booking is valid).
 */
export function validateBookingTimes(opts: {
  startTime?: string;
  endTime?: string;
  durationHours?: number;
  minimumHours?: number;
}): string[] {
  const errors: string[] = [];
  const start = parseTimeToMinutes(opts.startTime);
  const end = parseTimeToMinutes(opts.endTime);

  if (start === null) errors.push("Start time is required.");
  if (end === null) errors.push("End time is required.");
  if (errors.length > 0) return errors;

  const hours = opts.durationHours ?? computeDurationHours(opts.startTime, opts.endTime);

  if (hours <= 0) {
    errors.push("End time must be after start time.");
  }

  if (opts.minimumHours && hours < opts.minimumHours) {
    errors.push(`Minimum booking is ${opts.minimumHours} hour${opts.minimumHours > 1 ? "s" : ""}.`);
  }

  if (hours > 72) {
    errors.push("Booking can't exceed 72 hours.");
  }

  return errors;
}
