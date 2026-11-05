export function isConcurrencyList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (level: unknown) => typeof level === 'number' && Number.isSafeInteger(level) && level > 0,
    ) &&
    new Set(value).size === value.length
  );
}
