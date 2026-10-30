import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createStubBuild } from '../../test-utils/create-stub-build.ts';
import { makeBlockingTestRun } from '../../test-utils/make-blocking-test-run.ts';
import { makeRecordingStub } from '../../test-utils/make-recording-stub.ts';
import { makeResolvingStub } from '../../test-utils/make-resolving-stub.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import { laneFiles } from './lane-files.ts';
import { runBrowserLane } from './run-browser-lane.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'browser-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    chromeDir: join(directory, 'chrome'),
    chromeDirs: {
      privateDir: join(directory, 'chrome'),
      runDir: join(directory, 'chrome', String(process.pid)),
    },
    run: buildBrowserRun(join(directory, 'repo'), 'build-box', String(process.pid)),
    userID: userInfo().uid,
  };
}

test('it runs the tests one file at a time, with the browser preload, after the arguments it takes', async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  await runBrowserLane(['--timeout=10000', '.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: { PATH: '/usr/bin' },
    runBuild: null,
    runTests,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    [
      '--parallel=1',
      '--preload',
      '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      '--timeout=10000',
      '.browser.test.ts',
    ],
    { PATH: '/usr/bin', BROWSER_LANE_RUN_ID: ctx.run.runID, TMPDIR: ctx.chromeDirs.runDir },
  );
});

test("it gives the build the run's build folder, and the tests the same folder", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);

  await runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: { PATH: '/usr/bin' },
    runBuild,
    runTests,
  });

  expect(runBuild).toHaveBeenCalledExactlyOnceWith({
    PATH: '/usr/bin',
    BROWSER_LANE_BUILD_DIR: ctx.run.buildDir,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(expect.any(Array), {
    PATH: '/usr/bin',
    BROWSER_LANE_BUILD_DIR: ctx.run.buildDir,
    BROWSER_LANE_RUN_ID: ctx.run.runID,
    TMPDIR: ctx.chromeDirs.runDir,
  });
});

test.each([
  ['pass', 0],
  ['fail', 1],
])(
  'it removes the run folder and the Chrome temp folder when the tests %s',
  async (_, testsExitCode) => {
    const ctx = await setupTest();

    const exitCode = await runBrowserLane(['.browser.test.ts'], {
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      runBuild: makeResolvingStub(0),
      runTests: makeResolvingStub(testsExitCode),
    });

    const runs = await readdir(ctx.run.runsDir);
    const chromeTmpdirs = await readdir(ctx.chromeDir);

    expect(exitCode).toBe(testsExitCode);
    expect(runs).toStrictEqual([]);
    expect(chromeTmpdirs).toStrictEqual([]);
  },
);

test('it fails, runs no tests and removes the run folder when it cannot create its folders', async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  await Bun.write(ctx.run.profilesDir, 'a file where the profiles folder goes');

  const lane = runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild: null,
    runTests,
  });

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const runs = await readdir(ctx.run.runsDir);

  expect(failure).toMatchObject({ message: 'the browser lane could not create its folders' });
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
});

test('it starts the tests only once the build finishes', async () => {
  const ctx = await setupTest();

  const build = createStubBuild();
  const runTests = makeResolvingStub(0);

  const lane = runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild: build.runBuild,
    runTests,
  });

  await build.started;

  const testRunsDuringBuild = runTests.mock.calls.length;

  build.finish(0);

  await lane;

  expect(testRunsDuringBuild).toBe(0);
  expect(runTests).toHaveBeenCalledOnce();
});

test('it fails with the exit code of a failed build, runs no tests and removes its folders', async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild: makeResolvingStub(2),
    runTests,
  });

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(exitCode).toBe(2);
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test("it fails, and runs no build or tests, when another user owns the Chrome folder's parent", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);

  const lane = runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID + 1,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild,
    runTests,
  });

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(failure).toMatchObject({
    message: `the browser lane's temp folder ${ctx.chromeDir} belongs to user ${ctx.userID}, not to user ${ctx.userID + 1}`,
  });

  expect(runBuild).not.toHaveBeenCalled();
  expect(runTests).not.toHaveBeenCalled();
  expect(chromeTmpdirs).toStrictEqual([]);
});

test("it fails, and runs no build or tests, when other users can open the Chrome folder's parent", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);

  await mkdir(ctx.chromeDir);
  await chmod(ctx.chromeDir, 0o755);

  const lane = runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild,
    runTests,
  });

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const chromeTmpdirs = await readdir(ctx.chromeDir);

  expect(failure).toMatchObject({
    message: `the browser lane's temp folder ${ctx.chromeDir} is open to other users, with mode 755`,
  });

  expect(runBuild).not.toHaveBeenCalled();
  expect(runTests).not.toHaveBeenCalled();
  expect(chromeTmpdirs).toStrictEqual([]);
});

test("it leaves every folder in place, and runs no build or tests, when the Chrome folder's parent is no folder of its own", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);
  const exited = Bun.spawn(['true']);

  await exited.exited;

  const otherDir = join(ctx.directory, 'other');
  const otherEntry = join(otherDir, String(exited.pid), 'notes.txt');

  await Bun.write(otherEntry, 'buy milk');

  await chmod(otherDir, 0o700);
  await symlink(otherDir, ctx.chromeDir);

  const lane = runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: {},
    runBuild,
    runTests,
  });

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const otherEntryExists = await Bun.file(otherEntry).exists();
  const otherEntries = await readdir(otherDir);

  expect(failure).toMatchObject({
    message: `the browser lane's temp folder ${ctx.chromeDir} is no folder of its own`,
  });

  expect(otherEntryExists).toBeTrue();
  expect(otherEntries).toStrictEqual([String(exited.pid)]);
  expect(runBuild).not.toHaveBeenCalled();
  expect(runTests).not.toHaveBeenCalled();
});

test("it keeps a build folder that the caller's environment names away from the tests when the repo has no build", async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  await runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError: makeRecordingStub(),
    environment: { PATH: '/usr/bin', BROWSER_LANE_BUILD_DIR: '/work/notes-app/old-build' },
    runBuild: null,
    runTests,
  });

  expect(runTests).toHaveBeenCalledExactlyOnceWith(expect.any(Array), {
    PATH: '/usr/bin',
    BROWSER_LANE_RUN_ID: ctx.run.runID,
    TMPDIR: ctx.chromeDirs.runDir,
  });
});

test('it reports a folder it cannot remove, and still returns the exit code of the tests', async () => {
  const ctx = await setupTest();

  const reportCleanupError = makeRecordingStub();

  const exitCode = await runBrowserLane(['.browser.test.ts'], {
    run: ctx.run,
    chromeDirs: ctx.chromeDirs,
    userID: ctx.userID,
    preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
    files: laneFiles,
    reportCleanupError,
    environment: {},
    runBuild: null,
    runTests: makeBlockingTestRun(ctx.chromeDir),
  });

  expect(exitCode).toBe(0);

  expect(reportCleanupError.mock.calls).toStrictEqual([
    [expect.objectContaining({ code: 'ENOTDIR' })],
  ]);
});
