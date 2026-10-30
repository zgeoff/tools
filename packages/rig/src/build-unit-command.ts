import type { RigConfig } from './types.ts';

// The e2e directories are not lanes with a suffix, so the unit run leaves them out by path.
const e2eIgnorePatterns = ['**/e2e/**', '**/*-e2e/**'];

export function buildUnitCommand(
  config: RigConfig,
  workerCount: number,
  extraArgs: readonly string[],
): readonly string[] {
  const suffixPatterns = config.lanes.flatMap((lane) =>
    lane.suffix === null ? [] : [`**/*${lane.suffix}.test.ts`, `**/*${lane.suffix}.test.tsx`],
  );

  const ignoreArgs = [...suffixPatterns, ...e2eIgnorePatterns].map(
    (pattern) => `--path-ignore-patterns=${pattern}`,
  );

  return ['bun', 'test', `--parallel=${workerCount}`, '--randomize', ...ignoreArgs, ...extraArgs];
}
