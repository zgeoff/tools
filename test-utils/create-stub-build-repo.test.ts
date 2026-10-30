import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTrackedFiles } from '../packages/rig/src/read-tracked-files.ts';
import { buildSteppingClock } from './build-stepping-clock.ts';
import { createStubBuildRepo } from './create-stub-build-repo.ts';
import { templateFiles } from './template-files.ts';
import type { TestProcesses } from './test-processes.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'stub-build-repo-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const clock = buildSteppingClock();

  return {
    repoRoot: join(directory, 'notes-app'),
    markerPath: join(directory, 'marker.txt'),
    processes: {
      readGroupID: mock<TestProcesses['readGroupID']>(() => 5120),
      signalGroup: mock<TestProcesses['signalGroup']>(() => {}),
      probeGroup: mock<TestProcesses['probeGroup']>(() => false),
      now: clock.now,
      sleep: clock.sleep,
    },
  };
}

test("it writes a build:browser script that passes the marker file and the build's process ID file", async () => {
  const ctx = await setupTest();

  await createStubBuildRepo(ctx.repoRoot, ctx.markerPath, ctx.processes, templateFiles);

  const manifestText = await readFile(join(ctx.repoRoot, 'package.json'), 'utf8');

  const manifest: unknown = JSON.parse(manifestText);

  expect(manifest).toStrictEqual({
    scripts: {
      'build:browser': expect.toEndWith(
        `'--marker' '${ctx.markerPath}' '--pid-file' '${join(ctx.repoRoot, 'build.pid')}'`,
      ),
    },
  });
});

test('it makes a git repo that tracks its manifest and one browser test file', async () => {
  const ctx = await setupTest();

  await createStubBuildRepo(ctx.repoRoot, ctx.markerPath, ctx.processes, templateFiles);

  const tracked = await readTrackedFiles(ctx.repoRoot);

  expect(tracked).toIncludeSameMembers(['notes.browser.test.ts', 'package.json']);
});

test("it sends SIGKILL to the group of the process ID that the build's file holds", async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    ctx.processes,
    templateFiles,
  );

  await writeFile(join(ctx.repoRoot, 'build.pid'), '4417');

  await repo.stop();

  expect(ctx.processes.readGroupID).toHaveBeenCalledExactlyOnceWith(4417);
  expect(ctx.processes.signalGroup).toHaveBeenCalledExactlyOnceWith(5120, 'SIGKILL');
  expect(ctx.processes.probeGroup).toHaveBeenCalledExactlyOnceWith(5120);
});

test('it stops nothing when no build wrote its process ID file', async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    ctx.processes,
    templateFiles,
  );

  await repo.stop();

  expect(ctx.processes.readGroupID).not.toHaveBeenCalled();
  expect(ctx.processes.signalGroup).not.toHaveBeenCalled();
});

test('it stops nothing when the process of the ID has exited', async () => {
  const ctx = await setupTest();

  ctx.processes.readGroupID.mockReturnValue(null);

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    ctx.processes,
    templateFiles,
  );

  await writeFile(join(ctx.repoRoot, 'build.pid'), '4417');

  await repo.stop();

  expect(ctx.processes.signalGroup).not.toHaveBeenCalled();
});

test('it fails when it cannot read the process ID file', async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    ctx.processes,
    templateFiles,
  );

  await mkdir(join(ctx.repoRoot, 'build.pid'));

  const failure = await repo.stop().then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'EISDIR' });
  expect(ctx.processes.signalGroup).not.toHaveBeenCalled();
});

test('it fails to read a start that the build never reports', async () => {
  const ctx = await setupTest();

  const repo = await createStubBuildRepo(
    ctx.repoRoot,
    ctx.markerPath,
    ctx.processes,
    templateFiles,
  );

  const failure = await repo
    .readStart(new Response('error: build failed\n').body ?? new ReadableStream())
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(failure).toMatchObject({
    message: 'the stub build never reported its start:\nerror: build failed\n',
  });
});
