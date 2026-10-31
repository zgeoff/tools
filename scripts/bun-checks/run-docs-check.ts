import { basename, join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import {
  docsScriptsFolder,
  pickDocsScripts,
  skillScript,
  visionScript,
} from './pick-docs-scripts.ts';

export interface DocsCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<FileSystem, 'probePath'>;

  // Runs a check script whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

// The docs-writing skill's scripts pick the docs they read themselves. Each one runs even after
// another fails, so the log names every check that fails. Returns the step's exit code.
export async function runDocsCheck(run: Readonly<DocsCheckRun>): Promise<number> {
  const hasScripts = await run.fileSystem.probePath(
    join(run.cwd, docsScriptsFolder, 'check-length.sh'),
  );

  if (!hasScripts) {
    run.writeOutput(
      `::notice::docs: skipped, because the repo has no ${docsScriptsFolder}/check-length.sh; take the skill-docs-writing entry of repo-sync to run it\n`,
    );

    return 0;
  }

  const vision = await run.fileSystem.probePath(join(run.cwd, visionScript));
  const skill = await run.fileSystem.probePath(join(run.cwd, skillScript));

  const scripts = pickDocsScripts({ vision, skill });
  let exitCode = 0;

  for (const script of scripts) {
    const result = await run.runLoggedCommand(['bash', script], {
      cwd: run.cwd,
      env: run.env,
    });

    if (result.exitCode !== 0) {
      run.writeOutput(
        `::error::docs: ${basename(script)} failed; its output above holds each failing file and its fault\n`,
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
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
