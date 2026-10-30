import { expect, mock, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createStubBuild } from '../../../../test-utils/create-stub-build.ts';
import { makeBlockingTestRun } from '../../../../test-utils/make-blocking-test-run.ts';
import { makeRecordingStub } from '../../../../test-utils/make-recording-stub.ts';
import { makeRejectingStub } from '../../../../test-utils/make-rejecting-stub.ts';
import { makeResolvingStub } from '../../../../test-utils/make-resolving-stub.ts';
import { runLaneHooks } from '../run-lane-hooks.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import { laneFiles } from './lane-files.ts';
import type { BrowserLaneOptions } from './make-browser-lane-hooks.ts';
import { makeBrowserLaneHooks } from './make-browser-lane-hooks.ts';
import { ProcessGroupStillRunningError } from './process-group-still-running-error.ts';
import { ProcessGroupStopError } from './process-group-stop-error.ts';
import type { ProcessGroups } from './process-groups.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-browser-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    chromeDir: join(directory, 'chrome'),
    chromeDirs: {
      privateDir: join(directory, 'chrome'),
      runsDir: join(directory, 'chrome', 'notes-app'),
      runDir: join(directory, 'chrome', 'notes-app', '7310'),
    },
    run: buildBrowserRun(join(directory, 'repo'), 'build-box', '7310'),
    userID: userInfo().uid,
    probeProcess: mock<(pid: number) => boolean>((pid) => pid === 7310),
    groups: { probeGroup: mock<ProcessGroups['probeGroup']>(() => false) },
  };
}

test('it runs the tests one file at a time, with the browser preload, after the arguments it takes', async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  const signal = new AbortController().signal;

  await runLaneHooks(
    ['--timeout=10000', '.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: { PATH: '/usr/bin' },
      signal,
      runBuild: null,
      runTests,
    }),
  );

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    [
      '--parallel=1',
      '--preload',
      '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      '--timeout=10000',
      '.browser.test.ts',
    ],
    { PATH: '/usr/bin', RIG_BROWSER_RUN_ID: ctx.run.runID, TMPDIR: ctx.chromeDirs.runDir },
    signal,
    join(ctx.run.groupsDir, 'pending-tests'),
  );
});

test("it gives the build the run's build folder, and the tests the same folder", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);

  const signal = new AbortController().signal;

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: { PATH: '/usr/bin' },
      signal,
      runBuild,
      runTests,
    }),
  );

  expect(runBuild).toHaveBeenCalledExactlyOnceWith(
    { PATH: '/usr/bin', RIG_BROWSER_BUILD_DIR: ctx.run.buildDir },
    signal,
    join(ctx.run.groupsDir, 'pending-build'),
  );

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    expect.any(Array),
    {
      PATH: '/usr/bin',
      RIG_BROWSER_BUILD_DIR: ctx.run.buildDir,
      RIG_BROWSER_RUN_ID: ctx.run.runID,
      TMPDIR: ctx.chromeDirs.runDir,
    },
    signal,
    join(ctx.run.groupsDir, 'pending-tests'),
  );
});

test.each([
  ['pass', 0],
  ['fail', 1],
])(
  'it removes the run folder and the Chrome temp folder when the tests %s',
  async (_, testsExitCode) => {
    const ctx = await setupTest();

    const exitCode = await runLaneHooks(
      ['.browser.test.ts'],
      makeBrowserLaneHooks({
        run: ctx.run,
        chromeDirs: ctx.chromeDirs,
        userID: ctx.userID,
        preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
        files: laneFiles,
        probeProcess: ctx.probeProcess,
        groups: ctx.groups,
        reportCleanupError: makeRecordingStub(),
        environment: {},
        signal: new AbortController().signal,
        runBuild: makeResolvingStub(0),
        runTests: makeResolvingStub(testsExitCode),
      }),
    );

    const runs = await readdir(ctx.run.runsDir);
    const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

    expect(exitCode).toBe(testsExitCode);
    expect(runs).toStrictEqual([]);
    expect(chromeTmpdirs).toStrictEqual([]);
  },
);

test('it fails, runs no tests and removes the run folder when it cannot create its folders', async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  await Bun.write(ctx.run.profilesDir, 'a file where the profiles folder goes');

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests,
    }),
  );

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

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: build.runBuild,
      runTests,
    }),
  );

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

  const exitCode = await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: makeResolvingStub(2),
      runTests,
    }),
  );

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

  expect(exitCode).toBe(2);
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test('it fails, and removes its folders, when an abort arrives as the tests exit 0', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  const runTests = mock<BrowserLaneOptions['runTests']>(() => {
    controller.abort();

    return Promise.resolve(0);
  });

  const exitCode = await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: controller.signal,
      runBuild: null,
      runTests,
    }),
  );

  const runs = await readdir(ctx.run.runsDir);

  expect(exitCode).toBe(1);
  expect(runTests).toHaveBeenCalledOnce();
  expect(runs).toStrictEqual([]);
});

test('it waits for an aborted build to exit, then removes its folders and starts no tests', async () => {
  const ctx = await setupTest();

  const build = createStubBuild();
  const runTests = makeResolvingStub(0);

  const controller = new AbortController();

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: controller.signal,
      runBuild: build.runBuild,
      runTests,
    }),
  );

  await build.started;

  controller.abort();

  const runsBeforeBuildExit = await readdir(ctx.run.runsDir);

  build.finish(143);

  const exitCode = await lane;
  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

  expect(runsBeforeBuildExit).toStrictEqual([ctx.run.runID]);
  expect(exitCode).toBe(1);
  expect(runTests).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([]);
  expect(chromeTmpdirs).toStrictEqual([]);
});

test('it removes the run folder of an older run whose process has exited', async () => {
  const ctx = await setupTest();

  const olderProfile = join(ctx.run.runsDir, '4417', 'profiles', 'Local State');
  const olderChromeTmpdir = join(ctx.chromeDirs.runsDir, '4417');

  await Bun.write(olderProfile, '{}');

  await mkdir(olderChromeTmpdir, { recursive: true, mode: 0o700 });

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests: makeResolvingStub(0),
    }),
  );

  const olderProfileExists = await Bun.file(olderProfile).exists();
  const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

  expect(olderProfileExists).toBeFalse();
  expect(chromeTmpdirs).toStrictEqual([]);
});

test("it leaves the Chrome folders of another repo's runs, whose process groups it cannot read", async () => {
  const ctx = await setupTest();

  const otherRepoChromeTmpdir = join(ctx.chromeDir, 'billing-app', '4417');

  await mkdir(otherRepoChromeTmpdir, { recursive: true, mode: 0o700 });

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests: makeResolvingStub(0),
    }),
  );

  const otherRepoChromeTmpdirs = await readdir(join(ctx.chromeDir, 'billing-app'));

  expect(otherRepoChromeTmpdirs).toStrictEqual(['4417']);
});

test("it fails, and runs no build or tests, when another user owns the Chrome folder's parent", async () => {
  const ctx = await setupTest();

  const runBuild = makeResolvingStub(0);
  const runTests = makeResolvingStub(0);

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID + 1,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild,
      runTests,
    }),
  );

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

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild,
      runTests,
    }),
  );

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
  const otherDir = join(ctx.directory, 'other');
  const otherEntry = join(otherDir, '4417', 'notes.txt');

  await Bun.write(otherEntry, 'buy milk');

  await chmod(otherDir, 0o700);
  await symlink(otherDir, ctx.chromeDir);

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild,
      runTests,
    }),
  );

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
  expect(otherEntries).toStrictEqual(['4417']);
  expect(runBuild).not.toHaveBeenCalled();
  expect(runTests).not.toHaveBeenCalled();
});

test('it makes the pending record of each command before the command starts, and passes its path', async () => {
  const ctx = await setupTest();

  const recordsAtStart: (readonly string[])[] = [];

  const readRecords = async () => {
    const records = await readdir(ctx.run.groupsDir);

    recordsAtStart.push(records.toSorted());

    return 0;
  };

  const runBuild = mock<NonNullable<BrowserLaneOptions['runBuild']>>(readRecords);
  const runTests = mock<BrowserLaneOptions['runTests']>(readRecords);

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild,
      runTests,
    }),
  );

  expect(recordsAtStart).toStrictEqual([['pending-build'], ['pending-build', 'pending-tests']]);
  expect(runBuild.mock.calls[0]?.[2]).toBe(join(ctx.run.groupsDir, 'pending-build'));
  expect(runTests.mock.calls[0]?.[3]).toBe(join(ctx.run.groupsDir, 'pending-tests'));
});

test("it keeps a build folder that the caller's environment names away from the tests when the repo has no build", async () => {
  const ctx = await setupTest();

  const runTests = makeResolvingStub(0);

  const signal = new AbortController().signal;

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: { PATH: '/usr/bin', RIG_BROWSER_BUILD_DIR: '/work/notes-app/old-build' },
      signal,
      runBuild: null,
      runTests,
    }),
  );

  expect(runTests).toHaveBeenCalledExactlyOnceWith(
    expect.any(Array),
    { PATH: '/usr/bin', RIG_BROWSER_RUN_ID: ctx.run.runID, TMPDIR: ctx.chromeDirs.runDir },
    signal,
    join(ctx.run.groupsDir, 'pending-tests'),
  );
});

test('it reports a folder it cannot remove, and still returns the exit code of the tests', async () => {
  const ctx = await setupTest();

  const reportCleanupError = makeRecordingStub();

  const exitCode = await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError,
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests: makeBlockingTestRun(ctx.chromeDirs.runsDir),
    }),
  );

  expect(exitCode).toBe(0);

  expect(reportCleanupError.mock.calls).toStrictEqual([
    [expect.objectContaining({ code: 'ENOTDIR' })],
  ]);
});

test('it keeps the folders of an older run whose lane has exited while a group it recorded still runs', async () => {
  const ctx = await setupTest();

  const olderRunID = '4417';
  const olderRun = buildBrowserRun(join(ctx.directory, 'repo'), 'build-box', olderRunID);

  await mkdir(join(olderRun.groupsDir, '6230'), { recursive: true });

  ctx.groups.probeGroup.mockImplementation((groupID) => groupID === 6230);

  const olderChromeTmpdir = join(ctx.chromeDirs.runsDir, olderRunID);

  await mkdir(olderChromeTmpdir, { recursive: true, mode: 0o700 });
  await chmod(ctx.chromeDir, 0o700);

  await runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError: makeRecordingStub(),
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests: makeResolvingStub(0),
    }),
  );

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

  expect(runs).toStrictEqual([olderRunID]);
  expect(chromeTmpdirs).toStrictEqual([olderRunID]);
});

test.each([
  {
    failure: 'a process group outlives SIGKILL',
    stopError: new ProcessGroupStillRunningError(5120),
  },
  {
    failure: 'the signal to a process group fails with EPERM',
    stopError: new ProcessGroupStopError(
      5120,
      'the browser lane could not stop the process group 5120',
      {
        cause: { code: 'EPERM', message: 'operation not permitted' },
      },
    ),
  },
])('it keeps its folders, and fails saying so, when $failure', async (row) => {
  const ctx = await setupTest();

  const reportCleanupError = makeRecordingStub();

  const lane = runLaneHooks(
    ['.browser.test.ts'],
    makeBrowserLaneHooks({
      run: ctx.run,
      chromeDirs: ctx.chromeDirs,
      userID: ctx.userID,
      preloadPath: '/work/notes-app/scripts/browser-lane/browser-preload.ts',
      files: laneFiles,
      probeProcess: ctx.probeProcess,
      groups: ctx.groups,
      reportCleanupError,
      environment: {},
      signal: new AbortController().signal,
      runBuild: null,
      runTests: makeRejectingStub(row.stopError),
    }),
  );

  const failure = await lane.then(
    () => null,
    (error: unknown) => error,
  );

  const runs = await readdir(ctx.run.runsDir);
  const chromeTmpdirs = await readdir(ctx.chromeDirs.runsDir);

  expect(failure).toMatchObject({
    message: 'the browser lane keeps its run folders, because it could not stop a process group',
    cause: row.stopError,
  });

  expect(reportCleanupError).not.toHaveBeenCalled();
  expect(runs).toStrictEqual([ctx.run.runID]);
  expect(chromeTmpdirs).toStrictEqual([ctx.run.runID]);
});
