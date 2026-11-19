export function isOneOf<const T extends readonly unknown[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return options.includes(value);
}
