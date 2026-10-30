export interface SyncedEntry {
  readonly name: string;
  readonly description: string;
}

export interface RetiredFileFacts {
  // The exit code and the stdout of the cleanup script, which prints each path it removed.
  readonly exitCode: number;
  readonly removedText: string;
}

export type RetiredFileRemoval =
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'removed';

      // The paths the removal commit deletes.
      readonly paths: readonly string[];

      // Empty when nothing is left to commit.
      readonly synced: readonly SyncedEntry[];
    };

export const retiredFilesName = 'retired-files';

export function planRetiredFileRemoval(facts: Readonly<RetiredFileFacts>): RetiredFileRemoval {
  if (facts.exitCode !== 0) {
    return { kind: 'failed' };
  }

  const removed = facts.removedText.split('\n').filter((path) => path !== '');
  const pathList = removed.map((path) => `\`${path}\``).join(', ');

  return {
    kind: 'removed',
    paths: removed,
    synced:
      removed.length === 0
        ? []
        : [
            {
              name: retiredFilesName,
              description: `The copies of files zgeoff/tools no longer syncs: ${pathList}`,
            },
          ],
  };
}
