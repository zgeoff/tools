// The keys whose value type admits undefined, an optional key among them.
type UndefinedKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

// Flattens an intersection into one object type, so editors show its keys.
type Simplify<T> = { [K in keyof T]: T[K] };

// T with each key that admits undefined made optional and its undefined dropped:
// { a: string | undefined; b: number } becomes { a?: string; b: number }.
export type ExactOptional<T extends object> = Simplify<
  Pick<T, Exclude<keyof T, UndefinedKeys<T>>> & {
    [K in keyof Pick<T, UndefinedKeys<T>>]?: Exclude<T[K], undefined>;
  }
>;

// Returns a new object with the own enumerable string keys of `value` whose
// value is not undefined; null values stay, and `value` is left untouched.
export function toExactOptional<T extends object>(value: T): ExactOptional<T> {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);

  return Object.fromEntries(entries) as ExactOptional<T>;
}
