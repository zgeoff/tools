import { expect, test } from 'bun:test';
import { collectStoppedRunFolders } from './collect-stopped-run-folders.ts';

test('it picks the folders whose test process no longer runs', () => {
  const folders = collectStoppedRunFolders(
    [
      '/scratch/kettle-pid4100-Ab12Cd',
      '/scratch/kettle-pid4200-Ef34Gh',
      '/repo/src/.test-lid-pid4100-Ij56Kl',
    ],
    (pid) => pid === 4200,
  );

  expect(folders).toStrictEqual([
    '/scratch/kettle-pid4100-Ab12Cd',
    '/repo/src/.test-lid-pid4100-Ij56Kl',
  ]);
});

test('it never picks a folder of a run that is still going', () => {
  expect(collectStoppedRunFolders(['/scratch/kettle-pid4200-Ef34Gh'], () => true)).toStrictEqual(
    [],
  );
});

test('it leaves a folder whose name carries no test process ID', () => {
  const folders = collectStoppedRunFolders(
    ['/scratch/kettle-4100-Ab12Cd', '/scratch/bun-build-Ab12Cd', '/scratch/kettle-pid4100'],
    () => false,
  );

  expect(folders).toStrictEqual([]);
});
