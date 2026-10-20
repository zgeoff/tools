// A value the merge replaces whole rather than merging key by key.
type WholeValue =
  | readonly unknown[]
  | ((...args: never[]) => unknown)
  | Date
  | RegExp
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | Promise<unknown>;

export type PartialDeep<T> = T extends WholeValue
  ? T
  : T extends object
    ? { [K in keyof T]?: PartialDeep<T[K]> }
    : T;

export function mergeDeep<T extends object>(base: T, patch: PartialDeep<T>): T {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: TypeScript cannot prove that a deep partial merged over T gives T
  return mergeRecords(base, patch) as T;
}

function mergeRecords(base: object, patch: object): object {
  const merged: object = { ...base };

  for (const key of Reflect.ownKeys(patch)) {
    if (Object.prototype.propertyIsEnumerable.call(patch, key)) {
      const current: unknown = Object.getOwnPropertyDescriptor(merged, key)?.value;
      const next: unknown = Reflect.get(patch, key);

      const value =
        isPlainObject(current) && isPlainObject(next) ? mergeRecords(current, next) : next;

      // an assignment to a `__proto__` key calls the inherited setter and
      // replaces the prototype, so each key is defined as an own data property
      Object.defineProperty(merged, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  return merged;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
