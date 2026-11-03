import { posix } from 'node:path';
import type { TestLayout } from './types.ts';

const testSuffix = '.test.ts';

// The faults of how test files are named: an e2e file's prefix, a module test with no module, and
// a lane suffix that no lane declares.
export function collectNameFaults(layout: TestLayout): string[] {
  const namesByFolder = Map.groupBy(layout.trackedPaths, (path) => posix.dirname(path));
  const faults: string[] = [];

  for (const path of layout.trackedPaths) {
    if (path.endsWith(testSuffix)) {
      const siblings = namesByFolder.get(posix.dirname(path)) ?? [];

      faults.push(
        ...collectE2ENameFaults(path, layout),
        ...collectModuleTestFaults(path, layout, siblings),
      );
    }
  }

  return faults;
}

const e2ePrefixes = [
  'start-',
  'stop-',
  'recover-',
  'cli-',
  'build-',
  'runtime-',
  'enforce-',
  'compat-',
  'journey-',
] as const;

function collectE2ENameFaults(path: string, layout: TestLayout): string[] {
  const folder = posix.dirname(path);
  const parent = posix.dirname(folder);

  const isE2EFolder =
    posix.basename(folder) === 'e2e' &&
    (parent === '.'
      ? !layout.isWorkspaceRepo
      : layout.trackedPaths.includes(posix.join(parent, 'package.json')));

  const name = posix.basename(path);

  if (!isE2EFolder || e2ePrefixes.some((prefix) => name.startsWith(prefix))) {
    return [];
  }

  return [
    `${path} doesn't start with an e2e prefix; rename it to start with ${e2ePrefixes.slice(0, -1).join(', ')} or ${e2ePrefixes.at(-1)}`,
  ];
}

// A test in a src/ folder sits beside the module it tests: `<base>.test.ts` beside `<base>.<ext>`,
// and `<base>.<word>.test.ts` beside `<base>.<ext>` when the word is a lane suffix, or beside
// `<base>.<word>.<ext>` when it is part of a module's name.
function collectModuleTestFaults(
  path: string,
  layout: TestLayout,
  siblings: readonly string[],
): string[] {
  const stem = posix.basename(path).slice(0, -testSuffix.length);
  const dotIndex = stem.lastIndexOf('.');
  const base = dotIndex === -1 ? stem : stem.slice(0, dotIndex);
  const word = dotIndex === -1 ? null : stem.slice(dotIndex + 1);
  const names = siblings.map((sibling) => posix.basename(sibling));

  const hasModule = (prefix: string): boolean =>
    names.some(
      (name) => name.startsWith(`${prefix}.`) && !name.slice(prefix.length + 1).includes('.'),
    );

  const isInSrc = posix.dirname(path).split('/').includes('src');
  const isLaneTest = word !== null && layout.laneSuffixes.includes(`.${word}`);

  if (word !== null && !isLaneTest) {
    return hasModule(`${base}.${word}`)
      ? []
      : [
          `${path} uses the suffix .${word}, which no lane in rig.config.ts declares, and ${base}.${word}.<ext> isn't beside it; declare the lane in rig.config.ts lanes, or rename the test after the module it tests`,
        ];
  }

  if (isInSrc && !hasModule(base)) {
    return [
      `${path} has no ${base}.<ext> beside it; move the test next to the module it tests, or rename it after that module`,
    ];
  }

  return [];
}
