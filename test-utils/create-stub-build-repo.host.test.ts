import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBuildRepo } from './create-stub-build-repo.ts';
import { readStreamUntil } from './read-stream-until.ts';
import { stopProcessGroups } from './stop-process-groups.ts';
import { templateFiles } from './template-files.ts';
import { testProcesses } from './test-processes.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'stub-build-repo-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runDir = join(directory, 'run');

  await mkdir(runDir);

  return {
    repoRoot: join(directory, 'notes-app'),
    markerPath: join(directory, 'marker.txt'),
    runDir,
  };
}

test('it runs a build that reports its process IDs and, on SIGTERM, writes whether the run folder still exists', async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    testProcesses,
    templateFiles,
  );

  const build = Bun.spawn([process.execPath, 'run', 'build:browser'], {
    cwd: ctx.repoRoot,
    env: { ...process.env, BROWSER_LANE_BUILD_DIR: join(ctx.runDir, 'build') },
    stdout: 'pipe',
    detached: true,
  });

  onTestFinished(() => {
    stopProcessGroups(build.pid, testProcesses);
  });

  const start = await repo.readStart(build.stdout);

  build.kill('SIGTERM');

  const exitCode = await build.exited;
  const marker = await Bun.file(ctx.markerPath).text();

  expect(start.buildPid).toBeGreaterThan(0);
  expect(start.helperPid).toBeGreaterThan(0);
  expect(exitCode).toBe(143);
  expect(marker).toBe('true');
});

test('it stops the process group of a build that started, from the process ID that the build writes', async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    testProcesses,
    templateFiles,
  );

  const runner = Bun.spawn(['bash', '-c', 'bun run build:browser & wait'], {
    cwd: ctx.repoRoot,
    env: { ...process.env, BROWSER_LANE_BUILD_DIR: join(ctx.runDir, 'build') },
    stdout: 'pipe',
    detached: true,
  });

  onTestFinished(() => {
    stopProcessGroups(runner.pid, testProcesses);
  });

  const output = await readStreamUntil(runner.stdout, '"event":"build-started"');

  await repo.stop();

  const exitCode = await runner.exited;

  expect(output).toContain('"event":"build-started"');
  expect(runner.signalCode).toBe('SIGKILL');
  expect(exitCode).not.toBe(0);
});
