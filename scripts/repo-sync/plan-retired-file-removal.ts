import { isWorkflowPath } from './is-workflow-path.ts';

export interface SyncedEntry {
  readonly name: string;
  readonly description: string;
}

export interface RetiredFileFacts {
  // The exit code and the stdout of the cleanup script, which prints each path it removed.
  readonly exitCode: number;
  readonly removedText: string;

  // Whether the token may push a change under .github/workflows/.
  readonly workflows: boolean;
}

export type RetiredFileRemoval =
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'removed';

      // The removed workflows go back, because the token cannot push their removal.
      readonly restoresWorkflows: boolean;

      // The paths the removal commit deletes.
      readonly paths: readonly string[];

      // Empty when nothing is left to commit.
      readonly synced: readonly SyncedEntry[];
    };

export const retiredFilesName = 'retired-files';

// The token cannot push a change under .github/workflows/ without workflows write, so a retired
// workflow stays until the repo takes an entry with a workflow target.
export function planRetiredFileRemoval(facts: Readonly<RetiredFileFacts>): RetiredFileRemoval {
  if (facts.exitCode !== 0) {
    return { kind: 'failed' };
  }

  const removed = facts.removedText.split('\n').filter((path) => path !== '');
  const kept = facts.workflows ? removed : removed.filter((path) => !isWorkflowPath(path));
  const pathList = kept.map((path) => `\`${path}\``).join(', ');

  return {
    kind: 'removed',
    restoresWorkflows: kept.length < removed.length,
    paths: kept,
    synced:
      kept.length === 0
        ? []
        : [
            {
              name: retiredFilesName,
              description: `The copies of files zgeoff/tools no longer syncs: ${pathList}`,
            },
          ],
  };
}
