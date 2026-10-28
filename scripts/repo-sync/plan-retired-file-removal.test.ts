import { expect, test } from 'bun:test';
import { planRetiredFileRemoval } from './plan-retired-file-removal.ts';

test('it fails the removal when the cleanup script fails', () => {
  const removal = planRetiredFileRemoval({ exitCode: 1, removedText: 'a.md\n', workflows: true });

  expect(removal).toStrictEqual({ kind: 'failed' });
});

test.each([
  [
    'commits every removed path when the token may push workflows',
    { exitCode: 0, removedText: 'a.md\n.github/workflows/old.yml\n', workflows: true },
    {
      kind: 'removed',
      restoresWorkflows: false,
      synced: [
        {
          name: 'retired-files',
          description:
            'The copies of files zgeoff/tools no longer syncs: `a.md`, `.github/workflows/old.yml`',
        },
      ],
    },
  ],
  [
    'restores a removed workflow and commits the rest when the token may not push workflows',
    { exitCode: 0, removedText: 'a.md\n.github/workflows/old.yml\n', workflows: false },
    {
      kind: 'removed',
      restoresWorkflows: true,
      synced: [
        {
          name: 'retired-files',
          description: 'The copies of files zgeoff/tools no longer syncs: `a.md`',
        },
      ],
    },
  ],
  [
    'restores a removed workflow and commits nothing when it was the only removed path',
    { exitCode: 0, removedText: '.github/workflows/old.yml\n', workflows: false },
    { kind: 'removed', restoresWorkflows: true, synced: [] },
  ],
  [
    'commits nothing when the script removed nothing',
    { exitCode: 0, removedText: '', workflows: true },
    { kind: 'removed', restoresWorkflows: false, synced: [] },
  ],
])('it %s', (_label, facts, expected) => {
  const removal: unknown = planRetiredFileRemoval(facts);

  expect(removal).toStrictEqual(expected);
});
