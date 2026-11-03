import { readlinkSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { removePath } from '../../packages/rig/src/browser/remove-path.ts';
import { collectStoppedRunFolders } from './collect-stopped-run-folders.ts';
import { readPIDNamespace } from './read-pid-namespace.ts';

export interface TestFolderSweepOptions {
  // The folders that hold test temp folders, such as the system temp folder.
  readonly readCandidatePaths: () => Promise<readonly string[]>;

  readonly namespace: string;

  readonly isRunning: (pid: number) => boolean;

  readonly removePath: (path: string) => Promise<void>;

  readonly reportFailure: (path: string, error: unknown) => void;
}

// Runs before each test lane starts, so it never meets a folder of the run it precedes.
export async function runTestFolderSweep(options: TestFolderSweepOptions): Promise<string[]> {
  const candidates = await options.readCandidatePaths();

  const stopped = collectStoppedRunFolders(candidates, options.namespace, options.isRunning);
  const removed: string[] = [];

  // A leftover the sweep cannot remove, such as a folder a test made read-only, must not stop the
  // test lane that follows.
  for (const path of stopped) {
    try {
      await options.removePath(path);

      removed.push(path);
    } catch (error) {
      options.reportFailure(path, error);
    }
  }

  return removed;
}

async function runCLI(): Promise<void> {
  await runTestFolderSweep({
    readCandidatePaths: async () => {
      const temp = tmpdir();

      const tempNames = await readdir(temp).catch((error: unknown) => {
        process.stderr.write(
          `test-folder-sweep: skipped ${temp}, which it could not read: ${String(error)}\n`,
        );

        return [];
      });

      const ignored = await $`git ls-files --others --ignored --exclude-standard --directory -z`
        .quiet()
        .text();

      return [
        ...tempNames.map((name) => join(temp, name)),
        ...ignored
          .split('\0')
          .filter((path) => path !== '')
          .map((path) => path.replace(/\/$/u, '')),
      ];
    },
    namespace: readPIDNamespace({ platform: process.platform, readLink: readlinkSync }),
    isRunning: (pid) => {
      try {
        process.kill(pid, 0);

        return true;
      } catch (error) {
        // EPERM means the process runs as another user.
        return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
      }
    },
    removePath,
    reportFailure: (path, error) => {
      process.stderr.write(
        `test-folder-sweep: kept ${path}, which it could not remove: ${String(error)}\n`,
      );
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
