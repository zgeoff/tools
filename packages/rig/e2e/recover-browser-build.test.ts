import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import { buildBrowserRun } from '../src/browser/build-browser-run.ts';
import { pickChromeDirs } from '../src/browser/pick-chrome-dirs.ts';
import { resolveProgram } from '../src/e2e.ts';
import type { StubBuildRepo } from '../src/test-utils/create-stub-build-repo.ts';
import { createStubBuildRepo } from '../src/test-utils/create-stub-build-repo.ts';
import { probeProcess } from '../src/test-utils/probe-process.ts';
import { stopProcessGroups } from '../src/test-utils/stop-process-groups.ts';
import { templateFiles } from '../src/test-utils/template-files.ts';
import { testProcesses } from '../src/test-utils/test-processes.ts';

async function setupTest() {
  const rig = await resolveProgram('rig');

  // The build's process ID file sits in the repo, so one cleanup stops the processes before it
  // removes the repo.
  const repoParent = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rig-browser-repo-')));

  const started: {
    repo: StubBuildRepo | null;
    laneTmpdir: string | null;
    chromeRunsDir: string | null;
    lanes: Bun.Subprocess[];
  } = { repo: null, laneTmpdir: null, chromeRunsDir: null, lanes: [] };

  // Registered before any later step can fail, so a failed setup still removes what it made.
  onTestFinished(async () => {
    for (const lane of started.lanes) {
      if (lane.exitCode === null && lane.signalCode === null) {
        await stopProcessGroups(lane.pid, testProcesses);
      }

      await lane.exited;
    }

    await started.repo?.stop();

    await rm(repoParent, { recursive: true, force: true });

    if (started.laneTmpdir !== null) {
      await rm(started.laneTmpdir, { recursive: true, force: true });
    }

    if (started.chromeRunsDir !== null) {
      await rm(started.chromeRunsDir, { recursive: true, force: true });
    }
  });

  const repoRoot = join(repoParent, 'notes-app');
  const markerPath = join(repoParent, 'run-folder-at-build-exit.txt');

  const repo = await createStubBuildRepo(repoRoot, markerPath, testProcesses, templateFiles);

  started.repo = repo;

  // The lane moves Chrome's temp folder to /tmp when TMPDIR is too long for Chrome's socket path,
  // so the lane gets a TMPDIR of its own that the test owns, and the test asks the lane's own rule
  // where the Chrome folder goes.
  const laneTmpdir = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rb-')));

  started.laneTmpdir = laneTmpdir;

  const chromeRunsDir = pickChromeDirs(
    laneTmpdir,
    userInfo().uid,
    buildBrowserRun(repoRoot, hostname(), '0'),
  ).runsDir;

  // A long TMPDIR sends Chrome's folder to the /tmp that every user shares, which the removal of
  // laneTmpdir does not reach.
  started.chromeRunsDir = chromeRunsDir;

  return {
    repo,
    repoRoot,
    markerPath,
    runsDir: join(repoRoot, 'node_modules', '.cache', 'rig', 'browser', hostname()),
    laneTmpdir,
    chromeRunsDir,
    startLane: () => {
      const lane = Bun.spawn([...rig.command, 'browser'], {
        cwd: repoRoot,
        env: { ...process.env, TMPDIR: laneTmpdir },
        stdout: 'pipe',
        stderr: 'ignore',
        detached: true,
      });

      started.lanes.push(lane);

      return lane;
    },

    readChromeRuns: () => readdir(chromeRunsDir),
  };
}

test("it keeps the folders of a run that SIGKILL stopped during its build in the next run, while the build's group still runs", async () => {
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
