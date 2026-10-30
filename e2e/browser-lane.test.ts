import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import type { StubBuildRepo } from '../test-utils/create-stub-build-repo.ts';
import { createStubBuildRepo } from '../test-utils/create-stub-build-repo.ts';
import { probeProcess } from '../test-utils/probe-process.ts';
import { stopProcessGroups } from '../test-utils/stop-process-groups.ts';
import { templateFiles } from '../test-utils/template-files.ts';
import { testProcesses } from '../test-utils/test-processes.ts';

async function setupTest() {
  // The build's process ID file sits in the repo, so one cleanup stops the processes before it
  // removes the repo.
  const repoParent = await mkdtemp(join(tmpdir(), 'browser-lane-repo-'));

  const started: {
    repo: StubBuildRepo | null;
    laneTmpdir: string | null;
    lanes: Bun.Subprocess[];
  } = { repo: null, laneTmpdir: null, lanes: [] };

  // Registered before any later step can fail, so a failed setup still removes what it made.
  onTestFinished(async () => {
    for (const lane of started.lanes) {
      if (lane.exitCode === null && lane.signalCode === null) {
        stopProcessGroups(lane.pid, testProcesses);
      }
    }

    await started.repo?.stop();

    await rm(repoParent, { recursive: true, force: true });

    if (started.laneTmpdir !== null) {
      await rm(started.laneTmpdir, { recursive: true, force: true });
    }
  });

  const repoRoot = join(repoParent, 'notes-app');
  const markerPath = join(repoParent, 'run-folder-at-build-exit.txt');

  const repo = await createStubBuildRepo(repoRoot, markerPath, testProcesses, templateFiles);

  started.repo = repo;

  // The lane moves Chrome's temp folder to /tmp when TMPDIR is too long for Chrome's socket path,
  // so the lane gets a short TMPDIR that the test owns.
  const laneTmpdir = await mkdtemp('/tmp/bl-');

  started.laneTmpdir = laneTmpdir;

  const chromeParent = join(laneTmpdir, `browser-lane-chrome-${userInfo().uid}`);

  return {
    repo,
    repoRoot,
    markerPath,
    runsDir: join(repoRoot, 'node_modules', '.cache', 'browser-lane', hostname()),
    laneTmpdir,
    chromeParent,
    startLane: () => {
      const lane = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, '..', 'sync', 'browser-lane', 'run-browser-lane.ts'),
        ],
        {
          cwd: repoRoot,
          env: { ...process.env, TMPDIR: laneTmpdir },
          stdout: 'pipe',
          stderr: 'ignore',
          detached: true,
        },
      );

      started.lanes.push(lane);

      return lane;
    },

    // Each repo gets one folder of Chrome runs inside the user's private folder.
    readChromeRuns: async () => {
      const repoKeys = await readdir(chromeParent);

      const runs = await Promise.all(
        repoKeys.map((repoKey) => readdir(join(chromeParent, repoKey))),
      );

      return runs.flat();
    },
  };
}

test.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
  'the lane stops a running build and the processes it started on %s, and waits for the build to exit before it removes its folders',
  async (signal) => {
    const ctx = await setupTest();

    const lane = ctx.startLane();

    const start = await ctx.repo.readStart(lane.stdout);

    const buildGroupID = testProcesses.readGroupID(start.buildPid);

    const groupsDuringBuild = await readdir(join(ctx.runsDir, String(lane.pid), 'groups'));

    lane.kill(signal);

    const exitCode = await lane.exited;
    const runFolderAtBuildExit = await Bun.file(ctx.markerPath).text();
    const runs = await readdir(ctx.runsDir);
    const chromeParents = await readdir(ctx.laneTmpdir);
    const chromeRuns = await ctx.readChromeRuns();

    expect(groupsDuringBuild).toStrictEqual([String(buildGroupID)]);
    expect(exitCode).toBe(1);
    expect(runFolderAtBuildExit).toBe('true');
    expect(runs).toStrictEqual([]);
    expect(chromeParents).toStrictEqual([`browser-lane-chrome-${userInfo().uid}`]);
    expect(chromeRuns).toStrictEqual([]);
    expect(probeProcess(start.buildPid)).toBeFalse();
    expect(probeProcess(start.helperPid)).toBeFalse();
  },
);

test("the next lane keeps the folders of a lane that SIGKILL stopped during its build, while the build's group still runs", async () => {
  const ctx = await setupTest();

  const killedLane = ctx.startLane();

  const start = await ctx.repo.readStart(killedLane.stdout);

  killedLane.kill('SIGKILL');

  await killedLane.exited;

  // The next lane runs no build, so its sweep is the only thing it does to the killed run.
  await Bun.write(join(ctx.repoRoot, 'package.json'), '{}');

  const nextLane = ctx.startLane();

  await nextLane.exited;

  const runs = await readdir(ctx.runsDir);
  const chromeRuns = await ctx.readChromeRuns();

  expect(probeProcess(start.buildPid)).toBeTrue();
  expect(runs).toStrictEqual([String(killedLane.pid)]);
  expect(chromeRuns).toStrictEqual([String(killedLane.pid)]);
});
