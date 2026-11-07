import { makeIgnoreCheck } from './make-ignore-check.ts';
import type { BunfigDeclaration } from './types.ts';

// One `bun test` process: the folder it runs from, the bunfig it reads, and its tests.
export interface TestRun {
  // Relative to the repo root, and '' for the root.
  readonly folder: string;

  // A path relative to the repo root that the run passes as --config, or null for the bunfig.toml
  // of the run's folder.
  readonly bunfig: string | null;

  // Test files relative to the repo root, or null when bun test finds the tests under the folder.
  readonly files: readonly string[] | null;

  // Globs relative to the repo root of the tests that another run takes.
  readonly ignore: readonly string[];
}

export interface TestRunRequest {
  readonly bunfigs: readonly BunfigDeclaration[];

  readonly trackedFiles: readonly string[];

  // The unit tests to run, relative to the repo root.
  readonly tests: readonly string[];

  // True when the root run finds its own tests, as a run of the whole unit lane does.
  readonly isDiscovery: boolean;
}

interface TestGroup {
  readonly folder: string;

  readonly bunfig: string | null;

  readonly files: string[];
}

// bun test reads only the bunfig.toml of the folder it runs from, and resolves a preload against
// that folder, even under --config. So a package with a bunfig.toml of its own runs its tests from
// its folder, and a bunfigs entry runs its tests from the repo root.
export function collectTestRuns(request: TestRunRequest): TestRun[] {
  const packageFolders = collectPackageBunfigFolders(request.trackedFiles);

  const bunfigChecks = request.bunfigs.map((bunfig) => ({
    path: bunfig.path,
    isBunfigFile: makeIgnoreCheck(bunfig.files),
  }));

  const groups = new Map<string, TestGroup>();

  for (const test of request.tests) {
    const bunfig = bunfigChecks.find((check) => check.isBunfigFile(test))?.path ?? null;

    const folder =
      bunfig === null ? (packageFolders.find((owner) => test.startsWith(`${owner}/`)) ?? '') : '';

    const key = JSON.stringify([folder, bunfig]);
    const group = groups.get(key) ?? { folder, bunfig, files: [] };

    group.files.push(test);
    groups.set(key, group);
  }

  const otherRunGlobs = [
    ...packageFolders.map((folder) => `${folder}/**`),
    ...request.bunfigs.flatMap((bunfig) => bunfig.files),
  ];

  return [...groups.values()]
    .toSorted((first, second) => toSortKey(first).localeCompare(toSortKey(second)))
    .map((group) => {
      const isRootDiscovery = request.isDiscovery && group.folder === '' && group.bunfig === null;

      return {
        folder: group.folder,
        bunfig: group.bunfig,
        files: isRootDiscovery ? null : group.files,
        ignore: isRootDiscovery ? otherRunGlobs : [],
      };
    });
}

// The deepest package folder above a test owns it, so the list runs from the deepest folder up.
function collectPackageBunfigFolders(trackedFiles: readonly string[]): readonly string[] {
  const tracked = new Set(trackedFiles);

  const suffix = '/bunfig.toml';

  return trackedFiles
    .filter((file) => file.endsWith(suffix))
    .map((file) => file.slice(0, -suffix.length))
    .filter((folder) => tracked.has(`${folder}/package.json`))
    .toSorted((first, second) => second.length - first.length);
}

function toSortKey(group: TestGroup): string {
  return group.folder === '' && group.bunfig === null
    ? ''
    : `${group.folder}\0${group.bunfig ?? ''}`;
}
