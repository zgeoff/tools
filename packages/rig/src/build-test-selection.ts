import { isAbsolute, relative } from 'node:path';
import { match } from 'ts-pattern';
import type { TestArgs } from './parse-test-args.ts';
import { pickE2EDirs } from './pick-e2e-dirs.ts';
import type { ResolvedLane, RigConfig } from './types.ts';

export type TestSelection =
  | { readonly kind: 'lane'; readonly flags: readonly string[] }
  | { readonly kind: 'files'; readonly files: readonly string[]; readonly flags: readonly string[] }
  | { readonly kind: 'none' };

export interface TestSelectionRequest {
  readonly config: RigConfig;

  readonly lane: Pick<ResolvedLane, 'name' | 'suffix'>;

  readonly repoRoot: string;

  readonly trackedFiles: readonly string[];

  readonly args: TestArgs;
}

// bun test runs every file that a path argument names, whatever lane the file belongs to, so rig
// narrows the paths to the lane's own files and hands bun test that exact list.
export function buildTestSelection(request: TestSelectionRequest): TestSelection {
  const split = request.args;

  if (split.paths.length === 0) {
    return { kind: 'lane', flags: split.flags };
  }

  const laneFiles = collectLaneTestFiles(request.config, request.lane, request.trackedFiles);

  const selectors = split.paths.map((path) =>
    buildSelector(path, request.repoRoot, request.trackedFiles),
  );

  const files = laneFiles.filter((file) =>
    selectors.some((selector) => isSelected(file, selector)),
  );

  return files.length === 0
    ? { kind: 'none' }
    : { kind: 'files', files: files.map((file) => `./${file}`), flags: split.flags };
}

const testFilePattern = /[._](?:test|spec)\.[jt]sx?$/u;

// The unit lane takes every test file that no other lane claims, the e2e lane the ones under its
// folders, and any other lane the ones with its suffix.
function collectLaneTestFiles(
  config: RigConfig,
  lane: Pick<ResolvedLane, 'name' | 'suffix'>,
  trackedFiles: readonly string[],
): readonly string[] {
  const e2eDirs = pickE2EDirs(trackedFiles);

  const isUnderE2EDir = (file: string) =>
    e2eDirs.some((directory) => file.startsWith(`${directory}/`));

  const isClaimedBySuffix = (file: string) =>
    config.lanes.some((other) => other.suffix !== null && hasLaneSuffix(file, other.suffix));

  const testFiles = trackedFiles.filter((file) => testFilePattern.test(file));
  const suffix = lane.suffix;

  if (suffix !== null) {
    return testFiles.filter((file) => hasLaneSuffix(file, suffix));
  }

  return lane.name === 'e2e'
    ? testFiles.filter((file) => isUnderE2EDir(file) && !isClaimedBySuffix(file))
    : testFiles.filter((file) => !isUnderE2EDir(file) && !isClaimedBySuffix(file));
}

function hasLaneSuffix(file: string, suffix: string): boolean {
  return file.endsWith(`${suffix}.test.ts`) || file.endsWith(`${suffix}.test.tsx`);
}

type Selector =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'filter'; readonly text: string }
  | { readonly kind: 'missing' };

// A path names a tracked file or a folder that holds one. A bare word that names neither is bun
// test's filter on the path, and a `./` or absolute path that names neither selects nothing.
function buildSelector(path: string, repoRoot: string, trackedFiles: readonly string[]): Selector {
  const relativePath = isAbsolute(path) ? relative(repoRoot, path) : path;
  const normalized = relativePath.replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, '');

  if (normalized === '' || normalized === '.') {
    return { kind: 'directory', path: '' };
  }

  if (trackedFiles.includes(normalized)) {
    return { kind: 'file', path: normalized };
  }

  if (trackedFiles.some((file) => file.startsWith(`${normalized}/`))) {
    return { kind: 'directory', path: normalized };
  }

  const isPathLike = path.startsWith('./') || path.startsWith('../') || isAbsolute(path);

  return isPathLike ? { kind: 'missing' } : { kind: 'filter', text: path };
}

function isSelected(file: string, selector: Selector): boolean {
  return match(selector)
    .with({ kind: 'file' }, (fileSelector) => file === fileSelector.path)
    .with(
      { kind: 'directory' },
      (directory) => directory.path === '' || file.startsWith(`${directory.path}/`),
    )
    .with({ kind: 'filter' }, (filter) => file.includes(filter.text))
    .with({ kind: 'missing' }, () => false)
    .exhaustive();
}
