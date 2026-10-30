import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeResolvingStub } from '../../test-utils/make-resolving-stub.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import { laneFiles } from './lane-files.ts';
import { startBrowser } from './start-browser.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'browser-start-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  return { repoRoot, run: buildBrowserRun(repoRoot, 'build-box', '4417') };
}

test("it opens the file's Chrome on its own profile folder inside the run's folder", async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  await startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: { BROWSER_LANE_RUN_ID: '4417' },
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  expect(openView).toHaveBeenCalledExactlyOnceWith(
    join(ctx.run.profilesDir, 'profile-for-notes-file'),
  );
});

test('it fails the file, and starts no Chrome, when the lane set no run ID', async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  const start = startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: {},
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  const failure = await start.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message:
      'the browser preload needs the run that the browser lane sets up, and BROWSER_LANE_RUN_ID names none; run the suites with `bun run test:browser`',
  });

  expect(openView).not.toHaveBeenCalled();
});

test('it opens Chrome when the build folder holds the build', async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  await Bun.write(join(ctx.run.buildDir, 'index.html'), '<main>notes</main>');

  await startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: { BROWSER_LANE_RUN_ID: '4417', BROWSER_LANE_BUILD_DIR: ctx.run.buildDir },
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  expect(openView).toHaveBeenCalledOnce();
});

test('it fails the file, and starts no Chrome, when the build folder is missing', async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  const start = startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: { BROWSER_LANE_RUN_ID: '4417', BROWSER_LANE_BUILD_DIR: ctx.run.buildDir },
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  const failure = await start.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: `the browser run 4417 has no build in ${ctx.run.buildDir}; the build:browser script writes it to BROWSER_LANE_BUILD_DIR`,
  });

  expect(openView).not.toHaveBeenCalled();
});

test('it fails the file, and starts no Chrome, when the build folder is empty', async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  await mkdir(ctx.run.buildDir, { recursive: true });

  const start = startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: { BROWSER_LANE_RUN_ID: '4417', BROWSER_LANE_BUILD_DIR: ctx.run.buildDir },
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  const failure = await start.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: `the browser run 4417 has no build in ${ctx.run.buildDir}; the build:browser script writes it to BROWSER_LANE_BUILD_DIR`,
  });

  expect(openView).not.toHaveBeenCalled();
});

test('it fails the file, and starts no Chrome, when it cannot read the build folder', async () => {
  const ctx = await setupTest();

  const openView = makeResolvingStub(undefined);

  await Bun.write(ctx.run.buildDir, 'a file where the build folder goes');

  const start = startBrowser({
    repoRoot: ctx.repoRoot,
    hostName: 'build-box',
    environment: { BROWSER_LANE_RUN_ID: '4417', BROWSER_LANE_BUILD_DIR: ctx.run.buildDir },
    profileName: 'profile-for-notes-file',
    readDirNames: laneFiles.readDirNames,
    openView,
  });

  const failure = await start.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'ENOTDIR' });
  expect(openView).not.toHaveBeenCalled();
});
