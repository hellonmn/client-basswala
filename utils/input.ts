/**
 * utils/input.ts
 * Input sanitizers for React Native TextInput.
 *
 * `keyboardType="numeric"` still lets users paste "1,234.5a" or type "-".
 * These helpers strip anything that isn't a valid digit sequence.
 */

/** Keep only ASCII digits. Empty string on invalid input. */
export function sanitizeDigits(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[^\d]/g, "");
}

/** Sanitize to a positive integer and clamp to [min, max]. */
export function sanitizeInt(raw: string, min = 0, max = Number.MAX_SAFE_INTEGER): string {
  const digits = sanitizeDigits(raw);
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  if (n < min) return String(min);
  if (n > max) return String(max);
  return String(n);
}
