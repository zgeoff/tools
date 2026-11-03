import { posix } from 'node:path';
import type { TestLayout } from './types.ts';

// The faults of where folders sit: test folders, root folders of a workspace repo, helpers outside
// src/, integration folders, and the subfolders of e2e/, bench/ and evals/.
export function collectFolderFaults(layout: TestLayout): string[] {
  return [
    ...collectRootFolderFaults(layout),
    ...collectIntegrationFaults(layout.trackedPaths),
    ...collectTestFolderFaults(layout.trackedPaths),
    ...collectHelperFolderFaults(layout),
    ...collectSubfolderFaults(layout),
  ];
}

const rootFolders = ['e2e', 'evals', 'bench'] as const;

function collectRootFolderFaults(layout: TestLayout): string[] {
  const example = pickExampleWorkspace(layout.workspaces);

  const faults = rootFolders
    .filter((folder) => layout.isWorkspaceRepo && hasFolder(layout.trackedPaths, folder))
    .map(
      (folder) =>
        `${folder}/ sits at the repo root; move each file into the workspace it tests, such as ${example}/${folder}/`,
    );

  if (hasFolder(layout.trackedPaths, 'test-utils')) {
    const target = layout.isWorkspaceRepo
      ? `the workspace it tests, such as ${example}/src/test-utils/`
      : 'src/test-utils/';

    faults.push(`test-utils/ sits at the repo root; move each file into ${target}`);
  }

  return faults;
}

function pickExampleWorkspace(workspaces: readonly string[]): string {
  const [first] = workspaces;
  const parent = first === undefined ? '.' : posix.dirname(first);

  return parent === '.' ? 'packages/<name>' : `${parent}/<name>`;
}

function hasFolder(trackedPaths: readonly string[], folder: string): boolean {
  return trackedPaths.some((path) => path.startsWith(`${folder}/`));
}

// A folder named integration inside a src/ folder is source code, not a test folder.
function collectIntegrationFaults(trackedPaths: readonly string[]): string[] {
  return collectFolderPaths(trackedPaths)
    .filter(
      (folder) => posix.basename(folder) === 'integration' && !folder.split('/').includes('src'),
    )
    .map(
      (folder) =>
        `${folder}/ holds tests; move each one beside the module it tests, in the package that wires together the packages it imports`,
    );
}

// Every folder that holds a tracked path, each once, in order.
function collectFolderPaths(trackedPaths: readonly string[]): string[] {
  const folders = new Set<string>();

  for (const path of trackedPaths) {
    const segments = path.split('/').slice(0, -1);

    for (let length = 1; length <= segments.length; length += 1) {
      folders.add(segments.slice(0, length).join('/'));
    }
  }

  return [...folders].toSorted();
}

const testFolderNames = new Set(['test', 'tests', '__tests__']);

function collectTestFolderFaults(trackedPaths: readonly string[]): string[] {
  return collectFolderPaths(trackedPaths)
    .filter((folder) => testFolderNames.has(posix.basename(folder)))
    .map(
      (folder) =>
        `${folder}/ is a test folder; move its tests beside the modules they test, its end-to-end tests into the package's e2e/, and its helpers into src/test-utils/`,
    );
}

function collectHelperFolderFaults(layout: TestLayout): string[] {
  return layout.workspaces
    .filter((root) => layout.trackedPaths.some((path) => path.startsWith(`${root}/test-utils/`)))
    .map(
      (root) =>
        `${root}/test-utils/ holds test helpers outside src/; move each file into ${root}/src/test-utils/`,
    );
}

// An e2e/, bench/ or evals/ folder counts in a folder that holds a package.json, and at the root of
// a single-package repo.
function collectSubfolderFaults(layout: TestLayout): string[] {
  const tracked = new Set(layout.trackedPaths);

  const isPackageFolder = (parent: string): boolean =>
    parent === '' ? !layout.isWorkspaceRepo : tracked.has(posix.join(parent, 'package.json'));

  const faults = new Set<string>();

  for (const path of layout.trackedPaths) {
    const segments = path.split('/');

    for (const [index, name] of segments.entries()) {
      const parent = segments.slice(0, index).join('/');
      const rest = segments.slice(index + 1);
      const folder = posix.join(parent, name);

      if (!isPackageFolder(parent)) {
        continue;
      }

      const [first, second] = rest;

      if (name === 'e2e' && second !== undefined && first !== 'fixtures') {
        faults.add(
          `${folder}/${first}/ is a subfolder of ${folder}/; keep the tests flat in ${folder}/, with fixtures in ${folder}/fixtures/ and helpers in src/test-utils/`,
        );
      }

      if (name === 'bench' && second !== undefined) {
        faults.add(
          `${folder}/${first}/ is a subfolder of ${folder}/; keep the bench files flat in ${folder}/, with helpers in src/test-utils/`,
        );
      }

      const [suite, subfolder, inner] = rest;

      if (name === 'evals' && suite !== undefined && inner !== undefined) {
        faults.add(
          `${folder}/${suite}/${subfolder}/ is a subfolder of ${folder}/${suite}/; keep that suite's files flat in ${folder}/${suite}/, with helpers in src/test-utils/`,
        );
      }
    }
  }

  return [...faults].toSorted();
}
