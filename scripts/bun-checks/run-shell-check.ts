import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';

export interface ShellCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // Runs a command whose output the check reads.
  readonly runCommand: RunCommand;

  // Runs a check command whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

// Runs shellcheck and shfmt over every shell script git tracks, and fails on the findings of
// either, after both have run. Returns the step's exit code.
export async function runShellCheck(run: Readonly<ShellCheckRun>): Promise<number> {
  const options = { cwd: run.cwd, env: run.env };

  const listed = await runCheckedCommand(
    run.runCommand,
    ['git', 'ls-files', '-z', '--', '*.sh'],
    options,
  );

  const scripts = listed.stdout.split('\0').filter((path) => path !== '');

  if (scripts.length === 0) {
    run.writeOutput('shell: the repo tracks no shell script\n');

    return 0;
  }

  const shellcheck = await run.runLoggedCommand(
    [
      'shellcheck',
      '--external-sources',
      '--source-path=SCRIPTDIR',
      `--source-path=${run.cwd}`,
      '--',
      ...scripts,
    ],
    options,
  );

  const shfmt = await run.runLoggedCommand(['shfmt', '-d', '--', ...scripts], options);

  return shellcheck.exitCode === 0 && shfmt.exitCode === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exitCode = await runShellCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
