import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readRunFolderPrefix } from '../test-utils/read-run-folder-prefix.ts';
import { readPIDNamespace } from './read-pid-namespace.ts';
import { runTestFolderSweep } from './run-test-folder-sweep.ts';

function setupTest() {
  const removed: string[] = [];

  return {
    removed,
    removePath: (path: string) => {
      removed.push(path);

      return Promise.resolve();
    },
  };
}

test('it removes the temp folders of a stopped test process and returns them', async () => {
  const ctx = setupTest();

  const swept = await runTestFolderSweep({
    readCandidatePaths: () =>
      Promise.resolve([
        '/scratch/kettle-pid4100-ns7001-Ab12Cd',
        '/scratch/kettle-pid4200-ns7001-Ef34Gh',
      ]),
    namespace: '7001',
    isRunning: (pid) => pid === 4200,
    removePath: ctx.removePath,
  });

  expect(swept).toStrictEqual(['/scratch/kettle-pid4100-ns7001-Ab12Cd']);
  expect(ctx.removed).toStrictEqual(['/scratch/kettle-pid4100-ns7001-Ab12Cd']);
});

test('it never removes the files of a run that is still going', async () => {
  const ctx = setupTest();

  await runTestFolderSweep({
    readCandidatePaths: () => Promise.resolve(['/scratch/kettle-pid4200-ns7001-Ef34Gh']),
    namespace: '7001',
    isRunning: () => true,
    removePath: ctx.removePath,
  });

  expect(ctx.removed).toStrictEqual([]);
});

test('it removes the temp folder of an exited process and keeps a live or foreign-namespace one when run as a script', async () => {
  const temp = await mkdtemp(join(tmpdir(), readRunFolderPrefix('test-folder-sweep-')));

  onTestFinished(() => rm(temp, { recursive: true, force: true }));

  const exited = Bun.spawn(['true']);

  await exited.exited;

  const namespace = readPIDNamespace();

  await mkdir(join(temp, `kettle-pid${exited.pid}-ns${namespace}-Ab12Cd`));
  await mkdir(join(temp, `kettle-pid${process.pid}-ns${namespace}-Ef34Gh`));
  await mkdir(join(temp, `kettle-pid${exited.pid}-ns1-Gh56Ij`));

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
    .env({ ...process.env, TMPDIR: temp })
    .nothrow()
    .quiet();

  const names = await readdir(temp);

  expect(result.exitCode).toBe(0);

  expect(names).toIncludeSameMembers([
    `kettle-pid${exited.pid}-ns1-Gh56Ij`,
    `kettle-pid${process.pid}-ns${namespace}-Ef34Gh`,
  ]);
});
