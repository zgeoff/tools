type UndefinedKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

// Editors list an intersection's keys only once it is flattened into one object type.
type Simplify<T> = { [K in keyof T]: T[K] };

export type ExactOptional<T extends object> = T extends unknown
  ? Simplify<
      Pick<T, Exclude<keyof T, UndefinedKeys<T>>> & {
        [K in keyof Pick<T, UndefinedKeys<T>>]?: Exclude<T[K], undefined>;
      }
    >
  : never;

export function toExactOptional<T extends object>(value: T): ExactOptional<T> {
  const entries = Reflect.ownKeys(value)
    .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
    .map((key): [PropertyKey, unknown] => [key, Reflect.get(value, key)])
    .filter(([, entry]) => entry !== undefined);

  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: Object.fromEntries loses key types inside a generic
  return Object.fromEntries(entries) as ExactOptional<T>;
}
