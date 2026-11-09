import { expect, test } from 'bun:test';
import { planRetiredFileRemoval } from './plan-retired-file-removal.ts';

test('it fails the removal when the cleanup script fails', () => {
  const removal = planRetiredFileRemoval({ exitCode: 1, removedText: 'a.md\n' });

  expect(removal).toStrictEqual({ kind: 'failed' });
});

test('it commits every removed path, a workflow included', () => {
  const removal = planRetiredFileRemoval({
    exitCode: 0,
    removedText: 'a.md\n.github/workflows/old.yml\n',
  });

  expect(removal).toStrictEqual({
    kind: 'removed',
    paths: ['a.md', '.github/workflows/old.yml'],
    synced: [
      {
        name: 'retired-files',
        description:
          'The copies of files zgeoff/tools no longer syncs: `a.md`, `.github/workflows/old.yml`',
      },
    ],
  });
});

test('it commits nothing when the script removed nothing', () => {
  const removal = planRetiredFileRemoval({ exitCode: 0, removedText: '' });

  expect(removal).toStrictEqual({ kind: 'removed', paths: [], synced: [] });
});
