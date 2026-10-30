import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { BrowserRun } from './build-browser-run.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import type { LaneEnvironments } from './build-lane-environments.ts';
import { buildLaneEnvironments } from './build-lane-environments.ts';
import { buildRecordedCommand } from './build-recorded-command.ts';
import { findPrivateDirProblem } from './find-private-dir-problem.ts';
import { hasBrowserBuildScript } from './has-browser-build-script.ts';
import type { LaneFiles } from './lane-files.ts';
import { laneFiles } from './lane-files.ts';
import type { ChromeDirs } from './pick-chrome-dirs.ts';
import { pickChromeDirs } from './pick-chrome-dirs.ts';
import { pickExitCodeAfterTests } from './pick-exit-code-after-tests.ts';
import { pickStepAfterBuild } from './pick-step-after-build.ts';
import { probeProcess } from './probe-process.ts';
import { pendingRecordPrefix, probeRun } from './probe-run.ts';
import type { ProcessGroups } from './process-groups.ts';
import { processGroups } from './process-groups.ts';
import { processRuntime } from './process-runtime.ts';
import { removeExitedRunDirs } from './remove-exited-run-dirs.ts';
import { shouldKeepRunFolders } from './should-keep-run-folders.ts';
import { startProcessGroup } from './start-process-group.ts';

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
export async function runBrowserLane(
  testArgs: readonly string[],
  options: BrowserLaneOptions,
): Promise<number> {
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

  const cleanup = { keepsFolders: false };

  try {
    await createDirs([run.profilesDir, run.groupsDir, chromeDirs.runDir], files);

    const buildExitCode =
      options.runBuild === null ? null : await runBuild(options.runBuild, environments, options);

    const step = pickStepAfterBuild(buildExitCode, options.signal.aborted);

    return await match(step)
      .with({ kind: 'finish' }, (finish) => finish.exitCode)
      .with({ kind: 'run-tests' }, async () => {
        const testsRecord = await createPendingRecord(run.groupsDir, 'tests', files);

        const testsExitCode = await options.runTests(
          ['--parallel=1', '--preload', options.preloadPath, ...testArgs],
          environments.testsEnvironment,
          options.signal,
          testsRecord,
        );

        return pickExitCodeAfterTests(testsExitCode, options.signal.aborted);
      })
      .exhaustive();
  } catch (error) {
    cleanup.keepsFolders = shouldKeepRunFolders(error);

    if (cleanup.keepsFolders) {
      throw new Error(
        'the browser lane keeps its run folders, because it could not stop a process group',
        { cause: error },
      );
    }

    throw error;
  } finally {
    if (!cleanup.keepsFolders) {
      await removeDirs([run.runDir, chromeDirs.runDir], files, options.reportCleanupError);
    }
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

// A build or a test process gets this long to exit after SIGTERM before the lane sends SIGKILL.
const stopDeadlineMs = 10_000;

if (import.meta.main) {
  // `bun run` starts a package script in the folder of the package that defines it.
  const repoRoot = process.cwd();
  const run = buildBrowserRun(repoRoot, hostname(), String(process.pid));
  const userID = userInfo().uid;

  const manifest: unknown = await Bun.file(join(repoRoot, 'package.json')).json();

  const startCommand = (
    command: readonly string[],
    environment: Environment,
    signal: AbortSignal,
    pendingRecord: string,
  ) => {
    const group = startProcessGroup(buildRecordedCommand(run.groupsDir, pendingRecord, command), {
      cwd: repoRoot,
      environment,
      signal,
      stdout: 'inherit',
      stopDeadlineMs,
      groups: processGroups,
      runtime: processRuntime,
    });

    return group.exited;
  };

  // The memory-cap script stops the lane with a signal. The abort stops the build or the test
  // process, and the lane waits for it to exit before it removes its folders.
  const controller = new AbortController();

  const handleSignal = () => {
    controller.abort();
  };

  // The memory-cap script forwards each of these signals to the lane.
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('SIGHUP', handleSignal);

  process.exitCode = await runBrowserLane(process.argv.slice(2), {
    run,
    chromeDirs: pickChromeDirs(tmpdir(), userID, run),
    userID,
    preloadPath: join(import.meta.dir, 'browser-preload.ts'),
    environment: process.env,
    signal: controller.signal,
    files: laneFiles,
    probeProcess,
    groups: processGroups,
    reportCleanupError: (error) => {
      console.error('the browser lane could not remove a folder:', error);
    },
    runBuild: hasBrowserBuildScript(manifest)
      ? (environment, signal, pendingRecord) =>
          startCommand(
            [process.execPath, 'run', 'build:browser'],
            environment,
            signal,
            pendingRecord,
          )
      : null,
    runTests: (testArgs, environment, signal, pendingRecord) =>
      startCommand([process.execPath, 'test', ...testArgs], environment, signal, pendingRecord),
  });
}
