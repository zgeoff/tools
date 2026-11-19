// A value whose own methods a readonly mapped type would break.
type OpaqueValue = ((...args: never[]) => unknown) | Date | RegExp | Promise<unknown>;

export type ReadonlyDeep<T> = T extends OpaqueValue
  ? T
  : T extends ReadonlyMap<infer Key, infer Item>
    ? ReadonlyMap<ReadonlyDeep<Key>, ReadonlyDeep<Item>>
    : T extends ReadonlySet<infer Item>
      ? ReadonlySet<ReadonlyDeep<Item>>
      : T extends object
        ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
        : T;

export function toReadonlyDeep<T>(value: T): ReadonlyDeep<T> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: TypeScript cannot resolve the conditional type inside the generic
  return value as ReadonlyDeep<T>;
}
