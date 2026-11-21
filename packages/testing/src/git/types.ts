import type { TempDir, TreeFiles } from '../fs/types.ts';

export interface TestCommit {
  readonly message: string;

  // Applied on top of the first parent's tree.
  readonly files: TreeFiles;

  // The index of an earlier commit, the first parent. The commit before it when unset.
  readonly parent?: number;

  // The indexes of earlier commits, the further parents.
  readonly merged?: number | readonly number[];

  // ISO 8601. Sets both the author and the committer date. 2026-01-01T00:00:00Z when unset, so the
  // shas repeat across runs.
  readonly date?: string;
}

export interface TestRepo extends TempDir {
  // One sha per commit, in order.
  readonly commits: readonly string[];
}
