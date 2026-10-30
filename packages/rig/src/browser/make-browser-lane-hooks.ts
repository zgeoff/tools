import { join } from 'node:path';
import type { LaneHooks, LaneStartOutcome } from '../lane-hooks.ts';
import type { BrowserRun } from './build-browser-run.ts';
import type { LaneEnvironments } from './build-lane-environments.ts';
import { buildLaneEnvironments } from './build-lane-environments.ts';
import { findPrivateDirProblem } from './find-private-dir-problem.ts';
import type { LaneFiles } from './lane-files.ts';
import type { ChromeDirs } from './pick-chrome-dirs.ts';
import { pickExitCodeAfterTests } from './pick-exit-code-after-tests.ts';
import { pickStepAfterBuild } from './pick-step-after-build.ts';
import { pendingRecordPrefix, probeRun } from './probe-run.ts';
import type { ProcessGroups } from './process-groups.ts';
import { removeExitedRunDirs } from './remove-exited-run-dirs.ts';
import { shouldKeepRunFolders } from './should-keep-run-folders.ts';

type Environment = Readonly<Record<string, string | undefined>>;

export interface BrowserLaneOptions {
  readonly run: BrowserRun;

  readonly chromeDirs: ChromeDirs;

  readonly userID: number;

  readonly preloadPath: string;

  readonly environment: Environment;

  readonly signal: AbortSignal;

  readonly files: LaneFiles;

  readonly probeProcess: (pid: number) => boolean;

  readonly groups: Pick<ProcessGroups, 'probeGroup'>;

  readonly runBuild:
    | ((environment: Environment, signal: AbortSignal, pendingRecord: string) => Promise<number>)
    | null;

  readonly reportCleanupError: (error: unknown) => void;

  readonly runTests: (
    testArgs: readonly string[],
    environment: Environment,
    signal: AbortSignal,
    pendingRecord: string,
  ) => Promise<number>;
}

// `bun test --parallel=1` isolates each file, so the preload runs again for each one, and the
// build and the run ID come from here, once per run.
export function makeBrowserLaneHooks(options: BrowserLaneOptions): LaneHooks {
  const state = { hasRunFolders: false, keepsFolders: false };

  return {
    start: () => startBrowserLane(options, state),
    run: (testArgs, environment) =>
      guardRun(state, () => runBrowserTests(testArgs, environment, options)),
    stop: () => stopBrowserLane(options, state),
  };
}

interface BrowserLaneState {
  hasRunFolders: boolean;

  keepsFolders: boolean;
}

async function startBrowserLane(
  options: BrowserLaneOptions,
  state: BrowserLaneState,
): Promise<LaneStartOutcome> {
  const run = options.run;
  const chromeDirs = options.chromeDirs;
  const files = options.files;

  // Chrome's temp folder can sit in a /tmp that every user of the host shares, so its private
  // folder is checked before the lane writes or removes anything inside it.
  await files.createPrivateDir(chromeDirs.privateDir);

  const privateDirStatus = await files.readStatus(chromeDirs.privateDir);

  const privateDirProblem = findPrivateDirProblem(
    chromeDirs.privateDir,
    privateDirStatus,
    options.userID,
  );

  if (privateDirProblem !== null) {
    throw new Error(privateDirProblem);
  }

  const probeOlderRun = (runID: string) =>
    probeRun(runID, join(run.runsDir, runID, 'groups'), options);

  await Promise.all([
    removeExitedRunDirs(run.runsDir, files, probeOlderRun),
    removeExitedRunDirs(chromeDirs.runsDir, files, probeOlderRun),
  ]);

  const environments = buildLaneEnvironments(
    options.environment,
    run,
    chromeDirs.runDir,
    options.runBuild !== null,
  );

  state.hasRunFolders = true;

  return guardRun(state, async () => {
    await createDirs([run.profilesDir, run.groupsDir, chromeDirs.runDir], files);

    const buildExitCode =
      options.runBuild === null ? null : await runBuild(options.runBuild, environments, options);

    const step = pickStepAfterBuild(buildExitCode, options.signal.aborted);

    return step.kind === 'finish'
      ? step
      : { kind: 'proceed', environment: environments.testsEnvironment };
  });
}

// A process group that the lane could not stop can still write to the run's folders, so the stop
// step leaves them in place, and the error says so.
async function guardRun<Result>(
  state: BrowserLaneState,
  step: () => Promise<Result>,
): Promise<Result> {
  try {
    return await step();
  } catch (error) {
    state.keepsFolders = shouldKeepRunFolders(error);

    if (state.keepsFolders) {
      throw new Error(
        'the browser lane keeps its run folders, because it could not stop a process group',
        { cause: error },
      );
    }

    throw error;
  }
}

// A failed mkdir rejects Promise.all while the other still runs, and that one would make its
// folder again after the cleanup, so the lane waits for both.
async function createDirs(paths: readonly string[], files: LaneFiles): Promise<void> {
  const created = await Promise.allSettled(paths.map((path) => files.createDirs(path)));

  const failure = created.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failure !== undefined) {
    throw new Error('the browser lane could not create its folders', { cause: failure.reason });
  }
}

async function runBuild(
  build: NonNullable<BrowserLaneOptions['runBuild']>,
  environments: LaneEnvironments,
  options: BrowserLaneOptions,
): Promise<number> {
  const buildRecord = await createPendingRecord(options.run.groupsDir, 'build', options.files);

  return build(environments.buildEnvironment, options.signal, buildRecord);
}

// The lane makes each command's pending record before the command starts, so a sweep never sees a
// run whose lane has exited and whose command can still record its group.
async function createPendingRecord(
  groupsDir: string,
  commandName: string,
  files: LaneFiles,
): Promise<string> {
  const pendingRecord = join(groupsDir, `${pendingRecordPrefix}${commandName}`);

  await files.createDirs(pendingRecord);

  return pendingRecord;
}

async function runBrowserTests(
  testArgs: readonly string[],
  environment: Environment,
  options: BrowserLaneOptions,
): Promise<number> {
  const testsRecord = await createPendingRecord(options.run.groupsDir, 'tests', options.files);

  const testsExitCode = await options.runTests(
    ['--parallel=1', '--preload', options.preloadPath, ...testArgs],
    environment,
    options.signal,
    testsRecord,
  );

  return pickExitCodeAfterTests(testsExitCode, options.signal.aborted);
}

async function stopBrowserLane(
  options: BrowserLaneOptions,
  state: BrowserLaneState,
): Promise<void> {
  if (state.hasRunFolders && !state.keepsFolders) {
    await removeDirs(
      [options.run.runDir, options.chromeDirs.runDir],
      options.files,
      options.reportCleanupError,
    );
  }
}

// A throw from the cleanup would hide the lane's own error, so the lane reports a removal that fails and goes on.
async function removeDirs(
  paths: readonly string[],
  files: LaneFiles,
  reportCleanupError: (error: unknown) => void,
): Promise<void> {
  const removed = await Promise.allSettled(paths.map((path) => files.removePath(path)));

  for (const result of removed) {
    if (result.status === 'rejected') {
      reportCleanupError(result.reason);
    }
  }
}
