export function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> {
  const entries = keys.filter((key) => key in value).map((key): [K, T[K]] => [key, value[key]]);

  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: Object.fromEntries loses key types inside a generic
  return Object.fromEntries(entries) as Pick<T, K>;
}
