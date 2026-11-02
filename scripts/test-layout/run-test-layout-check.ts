import { $ } from 'bun';
import { writeStdout } from '../../packages/std/src/write-stdout.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { collectTestLayoutFaults } from './collect-test-layout-faults.ts';

export interface TestLayoutCheckOptions {
  readonly readTrackedPaths: () => Promise<readonly string[]>;

  readonly readText: (path: string) => Promise<string>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

export async function runTestLayoutCheck(options: TestLayoutCheckOptions): Promise<number> {
  let faults: string[];

  try {
    const trackedPaths = await options.readTrackedPaths();

    const sources = await Promise.all(
      trackedPaths
        .filter((path) => sourcePattern.test(path))
        .map(async (path) => ({ path, text: await options.readText(path) })),
    );

    faults = collectTestLayoutFaults(trackedPaths, sources);
  } catch (error) {
    options.writeError(`test-layout: ${error instanceof Error ? error.message : String(error)}\n`);

    return 2;
  }

  for (const fault of faults) {
    options.writeOutput(`${fault}\n`);
  }

  return faults.length === 0 ? 0 : 1;
}

async function runCLI(): Promise<void> {
  process.exitCode = await runTestLayoutCheck({
    readTrackedPaths: async () => {
      const listing = await $`git ls-files -z`.quiet().text();

      return listing.split('\0').filter((path) => path !== '');
    },
    readText: nodeFileSystem.readText,
    writeOutput: writeStdout,
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
