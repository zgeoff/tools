import type { BrowserRun } from './build-browser-run.ts';
import { buildDirVariable, runIDVariable } from './find-browser-run.ts';

type Environment = Readonly<Record<string, string | undefined>>;

export interface LaneEnvironments {
  readonly buildEnvironment: Environment;

  readonly testsEnvironment: Environment;
}

// Bun starts Chrome with the environment the test process started with, so Chrome's TMPDIR goes in
// the tests' environment.
export function buildLaneEnvironments(
  environment: Environment,
  run: BrowserRun,
  chromeRunDir: string,
  hasBuild: boolean,
): LaneEnvironments {
  // A build folder that the caller's environment names belongs to no build of this run.
  const { [buildDirVariable]: _, ...baseEnvironment } = environment;
  const buildDirEnvironment = hasBuild ? { [buildDirVariable]: run.buildDir } : {};

  return {
    buildEnvironment: { ...baseEnvironment, ...buildDirEnvironment },
    testsEnvironment: {
      ...baseEnvironment,
      ...buildDirEnvironment,
      [runIDVariable]: run.runID,
      TMPDIR: chromeRunDir,
    },
  };
}
