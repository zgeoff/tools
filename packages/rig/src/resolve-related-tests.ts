import { basename, join } from 'node:path';
import type { RigConfig } from './types.ts';

export interface RelatedTestSources {
  readonly cwd: string;

  readonly probeFile: (path: string) => boolean;
}

// The unit run covers a changed file through the test beside it, so each changed path maps to its
// sibling test, and the files of a lane drop out.
export function resolveRelatedTests(
  paths: readonly string[],
  config: RigConfig,
  sources: Readonly<RelatedTestSources>,
): string[] {
  const suffixes = config.lanes.flatMap((lane) => (lane.suffix === null ? [] : [lane.suffix]));

  const selected = new Set<string>();

  for (const path of paths) {
    const test = findRelatedTest(path, suffixes);

    if (test !== undefined && sources.probeFile(join(sources.cwd, test))) {
      selected.add(test);
    }
  }

  return [...selected];
}

const sourcePattern = /^(?<stem>.+?)(?:\.test)?(?<ext>\.tsx?)$/u;

function findRelatedTest(path: string, suffixes: readonly string[]): string | undefined {
  const groups = sourcePattern.exec(path)?.groups;

  if (groups === undefined || path.endsWith('.d.ts') || isLaneFile(path, suffixes)) {
    return undefined;
  }

  return `${groups['stem']}.test${groups['ext']}`;
}

// A lane's tests need a real system, such as a browser, a container or a live model API, and run
// only in CI.
function isLaneFile(path: string, suffixes: readonly string[]): boolean {
  const stem = basename(path).replace(/(?:\.test)?\.tsx?$/u, '');

  return (
    /(?:^|\/)(?:e2e|[^/]+-e2e)\//u.test(path) || suffixes.some((suffix) => stem.endsWith(suffix))
  );
}
