// The keys whose value type admits undefined, an optional key among them.
type UndefinedKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

// Flattens an intersection into one object type, so editors show its keys.
type Simplify<T> = { [K in keyof T]: T[K] };

// T with each key that admits undefined made optional and its undefined dropped:
// { a: string | undefined; b: number } becomes { a?: string; b: number }. A union
// maps member by member, so each member keeps its own keys.
export type ExactOptional<T extends object> = T extends unknown
  ? Simplify<
      Pick<T, Exclude<keyof T, UndefinedKeys<T>>> & {
        [K in keyof Pick<T, UndefinedKeys<T>>]?: Exclude<T[K], undefined>;
      }
    >
  : never;

// Returns a new object with the own enumerable keys of `value`, symbols included,
// whose value is not undefined; null values stay, and `value` is left untouched.
export function toExactOptional<T extends object>(value: T): ExactOptional<T> {
  const entries = Reflect.ownKeys(value)
    .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
    .map((key): [PropertyKey, unknown] => [key, Reflect.get(value, key)])
    .filter(([, entry]) => entry !== undefined);

  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: Object.fromEntries loses key types inside a generic
  return Object.fromEntries(entries) as ExactOptional<T>;
}
