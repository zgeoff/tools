import type { RigConfig } from './types.ts';

const isolationFlags: ReadonlySet<string> = new Set(['--isolate', '--no-isolate']);

// The e2e lane has no suffix, so the unit run leaves out the folders that the e2e lane selects,
// from the same list, and nothing else.
export function buildUnitCommand(
  config: RigConfig,
  e2eDirs: readonly string[],
  workerCount: number,
  extraArgs: readonly string[],
): readonly string[] {
  const suffixPatterns = config.lanes.flatMap((lane) =>
    lane.suffix === null ? [] : [`**/*${lane.suffix}.test.ts`, `**/*${lane.suffix}.test.tsx`],
  );

  const e2ePatterns = e2eDirs.map((directory) => `${directory}/**`);

  const ignoreArgs = [...suffixPatterns, ...e2ePatterns].map(
    (pattern) => `--path-ignore-patterns=${pattern}`,
  );

  const isolationArgs = extraArgs.some((argument) => isolationFlags.has(argument))
    ? []
    : ['--no-isolate'];

  return [
    'bun',
    'test',
    `--parallel=${workerCount}`,
    '--randomize',
    ...isolationArgs,
    ...ignoreArgs,
    ...extraArgs,
  ];
}
