import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { collectStoppedRunFolders } from './collect-stopped-run-folders.ts';

export interface TestFolderSweepOptions {
  // The folders that hold test temp folders, such as the system temp folder.
  readonly readCandidatePaths: () => Promise<readonly string[]>;

  readonly isRunning: (pid: number) => boolean;

  readonly removePath: (path: string) => Promise<void>;
}

// Runs before each test lane starts, so it never meets a folder of the run it precedes.
export async function runTestFolderSweep(options: TestFolderSweepOptions): Promise<string[]> {
  const candidates = await options.readCandidatePaths();

  const stopped = collectStoppedRunFolders(candidates, options.isRunning);

  for (const path of stopped) {
    await options.removePath(path);
  }

  return stopped;
}

async function runCLI(): Promise<void> {
  await runTestFolderSweep({
    readCandidatePaths: async () => {
      const temp = tmpdir();

      const tempNames = await readdir(temp).catch(() => []);

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
    isRunning: (pid) => {
      try {
        process.kill(pid, 0);

        return true;
      } catch (error) {
        // EPERM means the process runs as another user.
        return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
      }
    },
    removePath: (path) => rm(path, { recursive: true, force: true }),
  });
}

if (import.meta.main) {
  await runCLI();
}
