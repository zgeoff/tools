import { expect, test } from 'bun:test';
import { collectStoppedRunFolders } from './collect-stopped-run-folders.ts';

test('it picks the folders whose test process no longer runs', () => {
  const folders = collectStoppedRunFolders(
    [
      '/scratch/kettle-pid4100-ns7001-Ab12Cd',
      '/scratch/kettle-pid4200-ns7001-Ef34Gh',
      '/repo/src/.test-lid-pid4100-ns7001-Ij56Kl',
    ],
    '7001',
    (pid) => pid === 4200,
  );

  expect(folders).toStrictEqual([
    '/scratch/kettle-pid4100-ns7001-Ab12Cd',
    '/repo/src/.test-lid-pid4100-ns7001-Ij56Kl',
  ]);
});

test('it never picks a folder of a run that is still going', () => {
  expect(
    collectStoppedRunFolders(['/scratch/kettle-pid4200-ns7001-Ef34Gh'], '7001', () => true),
  ).toStrictEqual([]);
});

test('it leaves a folder from another PID namespace, whose process it cannot see', () => {
  expect(
    collectStoppedRunFolders(['/scratch/kettle-pid4100-ns7002-Ab12Cd'], '7001', () => false),
  ).toStrictEqual([]);
});

test('it picks nothing when it cannot read its own PID namespace', () => {
  expect(
    collectStoppedRunFolders(['/scratch/kettle-pid4100-nsunknown-Ab12Cd'], 'unknown', () => false),
  ).toStrictEqual([]);
});

test('it leaves a folder whose name carries no test process ID and namespace', () => {
  const folders = collectStoppedRunFolders(
    [
      '/scratch/kettle-4100-Ab12Cd',
      '/scratch/bun-build-Ab12Cd',
      '/scratch/kettle-pid4100-Ab12Cd',
      '/scratch/kettle-pid4100-ns7001',
    ],
    '7001',
    () => false,
  );

  expect(folders).toStrictEqual([]);
});
