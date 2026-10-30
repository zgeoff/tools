import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { buildDietCommand } from '../build-diet-command.ts';
import type { LaneHooks } from '../lane-hooks.ts';
import { buildBrowserRun } from './build-browser-run.ts';
import { buildRecordedCommand } from './build-recorded-command.ts';
import { hasBrowserBuildScript } from './has-browser-build-script.ts';
import { laneFiles } from './lane-files.ts';
import { makeBrowserLaneHooks } from './make-browser-lane-hooks.ts';
import { pickChromeDirs } from './pick-chrome-dirs.ts';
import { probeHostProcess } from './probe-host-process.ts';
import { processGroups } from './process-groups.ts';
import { processRuntime } from './process-runtime.ts';
import { startProcessGroup } from './start-process-group.ts';

type Environment = Readonly<Record<string, string | undefined>>;

export interface BrowserLaneWiring {
  readonly repoRoot: string;

  readonly runID: string;

  readonly memory: string | null;

  readonly dietScript: string;

  readonly environment: Environment;

  readonly signal: AbortSignal;
}

// A build or a test process gets this long to exit after SIGTERM before the lane sends SIGKILL.
const stopDeadlineMs = 10_000;

export async function wireBrowserLaneHooks(wiring: BrowserLaneWiring): Promise<LaneHooks> {
  const run = buildBrowserRun(wiring.repoRoot, hostname(), wiring.runID);
  const userID = userInfo().uid;

  const manifest: unknown = await Bun.file(join(wiring.repoRoot, 'package.json')).json();

  // Each command runs under diet, inside the process group that the lane records.
  const startCommand = (
    command: readonly string[],
    environment: Environment,
    signal: AbortSignal,
    pendingRecord: string,
  ) => {
    const capped = buildDietCommand(wiring.dietScript, wiring.memory, command);

    const group = startProcessGroup(buildRecordedCommand(run.groupsDir, pendingRecord, capped), {
      cwd: wiring.repoRoot,
      environment,
      signal,
      stdout: 'inherit',
      stopDeadlineMs,
      groups: processGroups,
      runtime: processRuntime,
    });

    return group.exited;
  };

  return makeBrowserLaneHooks({
    run,
    chromeDirs: pickChromeDirs(tmpdir(), userID, run),
    userID,
    preloadPath: join(import.meta.dir, 'browser-preload.ts'),
    environment: wiring.environment,
    signal: wiring.signal,
    files: laneFiles,
    probeProcess: probeHostProcess,
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
