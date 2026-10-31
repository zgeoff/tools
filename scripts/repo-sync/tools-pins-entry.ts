import type { SyncedEntry } from './plan-retired-file-removal.ts';

// The entry a sync pull request names when it only moves the pins.
export const toolsPinsEntry: SyncedEntry = {
  name: 'tools-pins',
  description:
    'The calls to zgeoff/tools workflows, whose pinned commit changed a workflow or a step script',
};
