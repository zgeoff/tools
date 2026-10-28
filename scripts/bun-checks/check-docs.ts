import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runLoggedCommand } from '../ci/run-logged-command.ts';

export interface DocsCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: FileSystem;

  // Runs a check script whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

const scriptsFolder = '.claude/skills/docs-writing/scripts';
const checkScripts = ['check-length.sh', 'check-links.sh'];

// The docs-writing skill's scripts pick the docs they read themselves. Each one runs even after
// another fails, so the log names every check that fails. Returns the step's exit code.
export async function runDocsCheck(run: Readonly<DocsCheckRun>): Promise<number> {
  const hasScripts = await run.fileSystem.probePath(
    join(run.cwd, scriptsFolder, 'check-length.sh'),
  );

  if (!hasScripts) {
    run.writeOutput(
      `::notice::docs: skipped, because the repo has no ${scriptsFolder}/check-length.sh; take the skill-docs-writing entry of repo-sync to run it\n`,
    );

    return 0;
  }

  let exitCode = 0;

  for (const script of checkScripts) {
    const result = await run.runLoggedCommand(['bash', join(scriptsFolder, script)], {
      cwd: run.cwd,
      env: run.env,
    });

    if (result.exitCode !== 0) {
      run.writeOutput(
        `::error::docs: ${script} failed; its output above holds each failing file and its fault\n`,
      );

      exitCode = 1;
    }
  }

  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await runDocsCheck({
    cwd: process.cwd(),
    env: process.env,
    fileSystem: nodeFileSystem,
    runLoggedCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
