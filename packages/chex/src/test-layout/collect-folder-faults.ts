import { posix } from 'node:path';
import type { TestLayout } from './types.ts';

// The faults of where folders sit: test folders, root folders of a workspace repo, helpers outside
// src/, integration folders, and the subfolders of e2e/, bench/ and evals/. A declared departure
// drops the fault of its folder, and is a fault itself when git tracks no file in that folder.
export function collectFolderFaults(layout: TestLayout): string[] {
  const departures = new Set(layout.departures);

  const placementFaults = [
    ...collectRootFolderFaults(layout),
    ...collectIntegrationFaults(layout.trackedPaths),
    ...collectTestFolderFaults(layout.trackedPaths),
    ...collectHelperFolderFaults(layout),
    ...collectSubfolderFaults(layout),
  ]
    .filter((fault) => !departures.has(fault.folder))
    .map((fault) => fault.message);

  return [...collectStaleDepartureFaults(layout), ...placementFaults];
}

interface FolderFault {
  readonly folder: string;

  readonly message: string;
}

const rootFolders: readonly string[] = ['e2e', 'evals', 'bench'];

function collectRootFolderFaults(layout: TestLayout): FolderFault[] {
  const faults = rootFolders
    .filter((folder) => layout.isWorkspaceRepo && hasFolder(layout.trackedPaths, folder))
    .map((folder) => ({
      folder,
      message: `${folder}/ sits at the repo root; move each file into the workspace it tests, such as ${pickExampleWorkspace(layout.workspaces, folder)}/${folder}/`,
    }));

  if (hasFolder(layout.trackedPaths, 'test-utils')) {
    const target = layout.isWorkspaceRepo
      ? `the workspace it tests, such as ${pickExampleWorkspace(layout.workspaces, 'test-utils')}/src/test-utils/`
      : 'src/test-utils/';

    faults.push({
      folder: 'test-utils',
      message: `test-utils/ sits at the repo root; move each file into ${target}`,
    });
  }

  return faults;
}

function hasFolder(trackedPaths: readonly string[], folder: string): boolean {
  return trackedPaths.some((path) => path.startsWith(`${folder}/`));
}

// A workspace inside the folder that the fault moves files out of makes no example.
function pickExampleWorkspace(workspaces: readonly string[], folder: string): string {
  const first = workspaces.find((workspace) => !workspace.startsWith(`${folder}/`));
  const parent = first === undefined ? '.' : posix.dirname(first);

  return parent === '.' ? 'packages/<name>' : `${parent}/<name>`;
}

function collectIntegrationFaults(trackedPaths: readonly string[]): FolderFault[] {
  return collectFolderPaths(trackedPaths)
    .filter((folder) => posix.basename(folder) === 'integration')
    .map((folder) => ({
      folder,
      message: `${folder}/ holds tests; move each one beside the module it tests, in the package that wires together the packages it imports`,
    }));
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

function collectTestFolderFaults(trackedPaths: readonly string[]): FolderFault[] {
  return collectFolderPaths(trackedPaths)
    .filter((folder) => testFolderNames.has(posix.basename(folder)))
    .map((folder) => ({
      folder,
      message: `${folder}/ is a test folder; move its tests beside the modules they test, its end-to-end tests into the package's e2e/, and its helpers into src/test-utils/`,
    }));
}

function collectHelperFolderFaults(layout: TestLayout): FolderFault[] {
  return layout.workspaces
    .filter((root) => layout.trackedPaths.some((path) => path.startsWith(`${root}/test-utils/`)))
    .map((root) => ({
      folder: `${root}/test-utils`,
      message: `${root}/test-utils/ holds test helpers outside src/; move each file into ${root}/src/test-utils/`,
    }));
}

// An e2e/, bench/ or evals/ folder counts in a folder that holds a package.json, and at the root of
// a single-package repo.
function collectSubfolderFaults(layout: TestLayout): FolderFault[] {
  const tracked = new Set(layout.trackedPaths);

  const isPackageFolder = (parent: string): boolean =>
    parent === '' ? !layout.isWorkspaceRepo : tracked.has(posix.join(parent, 'package.json'));

  const faults = new Map<string, string>();

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
        faults.set(
          `${folder}/${first}/ is a subfolder of ${folder}/; keep the tests flat in ${folder}/, with fixtures in ${folder}/fixtures/ and helpers in src/test-utils/`,
          `${folder}/${first}`,
        );
      }

      if (name === 'bench' && second !== undefined) {
        faults.set(
          `${folder}/${first}/ is a subfolder of ${folder}/; keep the bench files flat in ${folder}/, with helpers in src/test-utils/`,
          `${folder}/${first}`,
        );
      }

      const [suite, subfolder, inner] = rest;

      if (name === 'evals' && suite !== undefined && inner !== undefined) {
        faults.set(
          `${folder}/${suite}/${subfolder}/ is a subfolder of ${folder}/${suite}/; keep that suite's files flat in ${folder}/${suite}/, with helpers in src/test-utils/`,
          `${folder}/${suite}/${subfolder}`,
        );
      }
    }
  }

  return [...faults]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([message, folder]) => ({ folder, message }));
}

function collectStaleDepartureFaults(layout: TestLayout): string[] {
  return layout.departures
    .filter((folder) => !hasFolder(layout.trackedPaths, folder))
    .map(
      (folder) =>
        `${folder}/ is a test-layout departure in package.json, and git tracks no file in it; remove the departure`,
    );
}
