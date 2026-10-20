type TaggedBase = string | number | bigint;

type Untagged<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends bigint
      ? bigint
      : never;

// A tagged primitive, such as type-fest's Tagged<string, 'UserID'>, carries its
// tag under a key that its base type lacks, and a literal union has none, so
// the value of an untagged type is typed never.
type TaggedSource<T> = [Exclude<keyof T, keyof Untagged<T>>] extends [never] ? never : Untagged<T>;

export function toTagged<T extends TaggedBase>(value: TaggedSource<T>): T {
  const untagged: unknown = value;

  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: a type-fest Tagged value cannot be made without a cast
  return untagged as T;
}
