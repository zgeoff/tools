type TaggedBase = string | number | bigint;

type Untagged<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends bigint
      ? bigint
      : never;

type TagKey<T> = Exclude<keyof T, keyof Untagged<T>>;

// type-fest's Tagged<string, 'UserID'> carries its tag under a key its base
// lacks; a type with no tag, or a tag over a literal base, takes never
type TaggedSource<T> = [TagKey<T>] extends [never]
  ? never
  : Untagged<T> & Pick<T, TagKey<T>> extends T
    ? Untagged<T>
    : never;

export function toTagged<T extends TaggedBase>(value: TaggedSource<T>): T {
  const untagged: unknown = value;

  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: a type-fest Tagged value cannot be made without a cast
  return untagged as T;
}
