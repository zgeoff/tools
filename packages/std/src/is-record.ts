// Tells whether `value` is a plain keyed object, such as parsed JSON's `{}`: an array or null is
// not one.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
