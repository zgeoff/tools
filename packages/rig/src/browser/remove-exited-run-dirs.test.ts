import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProbeRun } from '../../../../test-utils/build-probe-run.ts';
import { laneFiles } from './lane-files.ts';
import { removeExitedRunDirs } from './remove-exited-run-dirs.ts';

async function setupTest() {
  const parentDir = await mkdtemp(join(tmpdir(), 'rig-browser-runs-'));

  onTestFinished(() => rm(parentDir, { recursive: true, force: true }));

  return { parentDir };
}

test('it removes the folder of a run whose process has exited, and keeps the folder of a running one', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.parentDir, '4417', 'profiles'), { recursive: true });
  await mkdir(join(ctx.parentDir, '5120', 'profiles'), { recursive: true });
  await removeExitedRunDirs(ctx.parentDir, laneFiles, buildProbeRun(['4417']));

  const entries = await readdir(ctx.parentDir);

  expect(entries).toStrictEqual(['4417']);
});

test('it never removes an entry whose name is no process ID', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.parentDir, 'notes'));
  await removeExitedRunDirs(ctx.parentDir, laneFiles, buildProbeRun([]));

  const entries = await readdir(ctx.parentDir);

  expect(entries).toStrictEqual(['notes']);
});

test('it removes nothing when the parent folder does not exist yet', async () => {
  const ctx = await setupTest();

  const parentDir = join(ctx.parentDir, 'missing');

  await removeExitedRunDirs(parentDir, laneFiles, buildProbeRun([]));

  const exists = await Bun.file(parentDir).exists();

  expect(exists).toBeFalse();
});

test('it fails when it cannot read the parent folder', async () => {
  const ctx = await setupTest();

  const parentDir = join(ctx.parentDir, 'runs');

  await Bun.write(parentDir, 'a file where the runs folder goes');

  const sweep = removeExitedRunDirs(parentDir, laneFiles, buildProbeRun([]));

  const failure = await sweep.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'ENOTDIR' });
});
