import { posix } from 'node:path';
import type { TestRun } from './collect-test-runs.ts';
import { testRunArgs } from './test-run-args.ts';
import type { RigConfig } from './types.ts';

// The e2e lane has no suffix, so the unit run leaves out the folders that the e2e lane selects,
// from the same list. A --path-ignore-patterns argument replaces bunfig.toml's pathIgnorePatterns,
// so the config's ignore list is the only place a repo can leave a path out of the unit run.
export interface UnitCommandRequest {
  readonly e2eDirs: readonly string[];

  readonly workerCount: number;

  readonly testRun: TestRun;

  readonly flags: readonly string[];
}

export function buildUnitCommand(
  config: RigConfig,
  request: UnitCommandRequest,
): readonly string[] {
  const testRun = request.testRun;

  const suffixPatterns = config.lanes.flatMap((lane) =>
    lane.suffix === null ? [] : [`**/*${lane.suffix}.test.ts`, `**/*${lane.suffix}.test.tsx`],
  );

  const e2ePatterns = request.e2eDirs.map((directory) => `${directory}/**`);

  const patterns = collectFolderPatterns(
    [...suffixPatterns, ...e2ePatterns, ...config.ignore, ...testRun.ignore],
    testRun.folder,
  );

  const ignoreArgs = patterns.map((pattern) => `--path-ignore-patterns=${pattern}`);
  const configArgs = testRun.bunfig === null ? [] : [`--config=./${testRun.bunfig}`];

  // bun test reads a bare argument as a name filter; the ./ makes it a path.
  const fileArgs = (testRun.files ?? []).map((file) => `./${posix.relative(testRun.folder, file)}`);

  return [
    'bun',
    'test',
    ...configArgs,
    `--parallel=${request.workerCount}`,
    ...testRunArgs,
    ...ignoreArgs,
    ...request.flags,
    ...fileArgs,
  ];
}

// bun test matches a glob against paths relative to the folder it runs from. A glob that starts
// with `**/` matches in any folder, and a glob for another folder can match nothing in this one.
function collectFolderPatterns(patterns: readonly string[], folder: string): readonly string[] {
  if (folder === '') {
    return patterns;
  }

  return patterns.flatMap((pattern) => {
    if (pattern.startsWith('**/')) {
      return [pattern];
    }

    return pattern.startsWith(`${folder}/`) ? [pattern.slice(folder.length + 1)] : [];
  });
}
