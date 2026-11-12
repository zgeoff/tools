import { join } from 'node:path';
import { runProgram } from './run-program.ts';
import { collectLaneSuffixes } from './test-layout/collect-lane-suffixes.ts';
import { collectTestLayoutFaults } from './test-layout/collect-test-layout-faults.ts';
import { collectWorkspaceRoots } from './test-layout/collect-workspace-roots.ts';
import type { OxcParserModule } from './test-layout/oxc-parser-module.ts';
import { parseTestLayoutDepartures } from './test-layout/parse-test-layout-departures.ts';
import { parseWorkspacePatterns } from './test-layout/parse-workspace-patterns.ts';
import { readOxcParser } from './test-layout/read-oxc-parser.ts';

export interface TestLayoutCheckOptions {
  readonly readTrackedPaths: () => Promise<readonly string[]>;

  // Reads a tracked file by its path relative to the repo root.
  readonly readText: (path: string) => Promise<string>;

  // The default export of the rig.config.ts at the repo root.
  readonly readRigConfig: () => Promise<unknown>;

  readonly readParser: () => Promise<OxcParserModule>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

// Returns the exit code: 0 for a tree with no layout fault, 1 with a fault, and 2 when the check
// cannot run.
export async function runTestLayoutCheck(options: TestLayoutCheckOptions): Promise<number> {
  let faults: string[];

  try {
    const trackedPaths = await options.readTrackedPaths();

    const tracked = new Set(trackedPaths);

    const manifestText = tracked.has('package.json')
      ? await options.readText('package.json')
      : '{}';

    const manifest: unknown = JSON.parse(manifestText);
    const workspaces = parseWorkspacePatterns(manifest);
    const departures = parseTestLayoutDepartures(manifest);

    if (departures.kind === 'refused') {
      options.writeError(`test-layout: package.json ${departures.reason}\n`);

      return 2;
    }

    const oxlintConfigText = tracked.has('.oxlintrc.json')
      ? await options.readText('.oxlintrc.json')
      : null;

    const rigConfig = tracked.has('rig.config.ts') ? await options.readRigConfig() : null;

    const sources = await Promise.all(
      trackedPaths
        .filter((path) => sourcePattern.test(path))
        .map(async (path) => ({ path, text: await options.readText(path) })),
    );

    const parser = await options.readParser();

    faults = collectTestLayoutFaults(
      parser,
      {
        trackedPaths,
        workspaces:
          workspaces.kind === 'single'
            ? []
            : collectWorkspaceRoots(trackedPaths, workspaces.patterns),
        isWorkspaceRepo: workspaces.kind === 'workspaces',
        laneSuffixes: collectLaneSuffixes(oxlintConfigText, rigConfig),
        departures: departures.folders,
      },
      sources,
    );
  } catch (error) {
    options.writeError(`test-layout: ${error instanceof Error ? error.message : String(error)}\n`);

    return 2;
  }

  for (const fault of faults) {
    options.writeOutput(`${fault}\n`);
  }

  return faults.length === 0 ? 0 : 1;
}

export function runTestLayoutCommand(): Promise<number> {
  const cwd = process.cwd();

  return runTestLayoutCheck({
    readTrackedPaths: () => {
      const listing = runProgram(['git', 'ls-files', '-z'], { cwd, env: process.env });

      if (listing.exitCode !== 0) {
        return Promise.reject(new Error(`git ls-files failed: ${listing.stderr.trim()}`));
      }

      return Promise.resolve(listing.stdout.split('\0').filter((path) => path !== ''));
    },
    readText: (path) => Bun.file(join(cwd, path)).text(),
    readRigConfig: async () => {
      const loaded: unknown = await import(join(cwd, 'rig.config.ts'));

      const defaultExport: unknown =
        typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : null;

      return defaultExport;
    },
    readParser: readOxcParser,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  process.exitCode = await runTestLayoutCommand();
}
