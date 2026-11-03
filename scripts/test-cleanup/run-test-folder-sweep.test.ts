import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
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
      Promise.resolve(['/scratch/kettle-pid4100-Ab12Cd', '/scratch/kettle-pid4200-Ef34Gh']),
    isRunning: (pid) => pid === 4200,
    removePath: ctx.removePath,
  });

  expect(swept).toStrictEqual(['/scratch/kettle-pid4100-Ab12Cd']);
  expect(ctx.removed).toStrictEqual(['/scratch/kettle-pid4100-Ab12Cd']);
});

test('it never removes the files of a run that is still going', async () => {
  const ctx = setupTest();

  await runTestFolderSweep({
    readCandidatePaths: () => Promise.resolve(['/scratch/kettle-pid4200-Ef34Gh']),
    isRunning: () => true,
    removePath: ctx.removePath,
  });

  expect(ctx.removed).toStrictEqual([]);
});

test('it removes the temp folder of an exited process and keeps the one of a live process when run as a script', async () => {
  const temp = await mkdtemp(join(tmpdir(), `test-folder-sweep-pid${process.pid}-`));

  onTestFinished(() => rm(temp, { recursive: true, force: true }));

  const exited = Bun.spawn(['true']);

  await exited.exited;
  await mkdir(join(temp, `kettle-pid${exited.pid}-Ab12Cd`));
  await mkdir(join(temp, `kettle-pid${process.pid}-Ef34Gh`));

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
    .env({ ...process.env, TMPDIR: temp })
    .nothrow()
    .quiet();

  const names = await readdir(temp);

  expect(result.exitCode).toBe(0);
  expect(names).toStrictEqual([`kettle-pid${process.pid}-Ef34Gh`]);
});
