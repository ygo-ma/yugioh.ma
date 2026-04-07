/**
 * Coerces an environment-variable string to a boolean.
 *
 * - `undefined` / empty / `"false"` / `"no"` / `"off"` → `false`
 * - Numeric strings → `false` if zero, `true` otherwise
 * - Anything else → `true`
 */
export function envToBool(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  if (lower === "false" || lower === "no" || lower === "off") return false;
  const num = Number(lower);
  if (!Number.isNaN(num)) return num !== 0;
  return true;
}
