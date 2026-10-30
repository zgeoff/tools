import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { BrowserRun } from './build-browser-run.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import { buildLaneEnvironments } from './build-lane-environments.ts';
import { findPrivateDirProblem } from './find-private-dir-problem.ts';
import { hasBrowserBuildScript } from './has-browser-build-script.ts';
import type { LaneFiles } from './lane-files.ts';
import { laneFiles } from './lane-files.ts';
import type { ChromeDirs } from './pick-chrome-dirs.ts';
import { pickChromeDirs } from './pick-chrome-dirs.ts';
import { pickStepAfterBuild } from './pick-step-after-build.ts';

type Environment = Readonly<Record<string, string | undefined>>;

export interface BrowserLaneOptions {
  readonly run: BrowserRun;

  readonly chromeDirs: ChromeDirs;

  readonly userID: number;

  readonly preloadPath: string;

  readonly environment: Environment;

  readonly files: LaneFiles;

  readonly runBuild: ((environment: Environment) => Promise<number>) | null;

  readonly reportCleanupError: (error: unknown) => void;

  readonly runTests: (testArgs: readonly string[], environment: Environment) => Promise<number>;
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

  const environments = buildLaneEnvironments(
    options.environment,
    run,
    chromeDirs.runDir,
    options.runBuild !== null,
  );

  try {
    await createDirs([run.profilesDir, chromeDirs.runDir], files);

    const buildExitCode =
      options.runBuild === null ? null : await options.runBuild(environments.buildEnvironment);

    const step = pickStepAfterBuild(buildExitCode);

    return await match(step)
      .with({ kind: 'finish' }, (finish) => finish.exitCode)
      .with({ kind: 'run-tests' }, () =>
        options.runTests(
          ['--parallel=1', '--preload', options.preloadPath, ...testArgs],
          environments.testsEnvironment,
        ),
      )
      .exhaustive();
  } finally {
    await removeDirs([run.runDir, chromeDirs.runDir], files, options.reportCleanupError);
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

if (import.meta.main) {
  // `bun run` starts a package script in the folder of the package that defines it.
  const repoRoot = process.cwd();
  const run = buildBrowserRun(repoRoot, hostname(), String(process.pid));
  const userID = userInfo().uid;

  const manifest: unknown = await Bun.file(join(repoRoot, 'package.json')).json();

  const runCommand = (command: readonly string[], environment: Environment) =>
    Bun.spawn([...command], {
      cwd: repoRoot,
      env: environment,
      stdio: ['inherit', 'inherit', 'inherit'],
    }).exited;

  process.exitCode = await runBrowserLane(process.argv.slice(2), {
    run,
    chromeDirs: pickChromeDirs(tmpdir(), userID, run),
    userID,
    preloadPath: join(import.meta.dir, 'browser-preload.ts'),
    environment: process.env,
    files: laneFiles,
    reportCleanupError: (error) => {
      console.error('the browser lane could not remove a folder:', error);
    },
    runBuild: hasBrowserBuildScript(manifest)
      ? (environment) => runCommand([process.execPath, 'run', 'build:browser'], environment)
      : null,
    runTests: (testArgs, environment) =>
      runCommand([process.execPath, 'test', ...testArgs], environment),
  });
}
