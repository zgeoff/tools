import { join } from 'node:path';
import { isRecord } from '../../../packages/std/src/is-record.ts';
import { collectWorkspaceCycles } from './collect-workspace-cycles.ts';

export interface WorkspaceCycleCheckOptions {
  // Reads and parses a JSON file, by its path from the repo root.
  readonly readJSON: (path: string) => Promise<unknown>;

  // Lists the folders, from the repo root, that a workspaces pattern matches.
  readonly readMatchingFolders: (pattern: string) => Promise<readonly string[]>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// Returns the exit code: 0 with no cycle, 1 with a cycle, 2 when a manifest cannot be read.
export async function runWorkspaceCycleCheck(options: WorkspaceCycleCheckOptions): Promise<number> {
  try {
    const root = await options.readJSON('package.json');

    const patterns = readWorkspacePatterns(root);

    const folderLists = await Promise.all(
      patterns.map((pattern) => options.readMatchingFolders(pattern)),
    );

    const manifests = await Promise.all(
      folderLists.flat().map((folder) => options.readJSON(join(folder, 'package.json'))),
    );

    const cycles = collectWorkspaceCycles(manifests);

    for (const cycle of cycles) {
      options.writeOutput(
        `workspace-cycle: ${cycle.join(' -> ')}; release-please can't order these releases, so remove one of these dependencies\n`,
      );
    }

    return cycles.length === 0 ? 0 : 1;
  } catch (error) {
    options.writeError(
      `workspace-cycle: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}

function readWorkspacePatterns(root: unknown): readonly string[] {
  const workspaces = isRecord(root) ? root['workspaces'] : null;
  const patterns = isRecord(workspaces) ? workspaces['packages'] : workspaces;

  return Array.isArray(patterns)
    ? patterns.filter((pattern): pattern is string => typeof pattern === 'string')
    : [];
}

async function runCLI(): Promise<void> {
  process.exitCode = await runWorkspaceCycleCheck({
    readJSON: (path) => Bun.file(path).json(),
    readMatchingFolders: async (pattern) => {
      const manifests = await Array.fromAsync(new Bun.Glob(`${pattern}/package.json`).scan('.'));

      return manifests.map((manifest) => join(manifest, '..')).toSorted();
    },
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
