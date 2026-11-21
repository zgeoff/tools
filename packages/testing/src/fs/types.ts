// The files of a tree, by path. A string is a file's content, null deletes the file, and a symlink
// entry is a link to the target as written, as `ln -s` takes it.
export type TreeFiles = Readonly<Record<string, string | null | { readonly symlink: string }>>;

export type CleanupMode = 'test' | 'manual';

export interface TempDir {
  readonly path: string;
  readonly remove: () => void;
}
