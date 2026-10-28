import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { buildPathBatches } from './build-path-batches.ts';

export interface ShellCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // Runs a command whose output the check reads.
  readonly runCommand: RunCommand;

  // Runs a check command whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;

  // The most argument bytes one shellcheck or shfmt command takes; more paths run in more commands.
  readonly batchBytes: number;
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

  const batches = buildPathBatches(scripts, run.batchBytes);
  const exitCodes: number[] = [];

  for (const batch of batches) {
    const shellcheck = await run.runLoggedCommand(
      [
        'shellcheck',
        '--external-sources',
        '--source-path=SCRIPTDIR',
        `--source-path=${run.cwd}`,
        '--',
        ...batch,
      ],
      options,
    );

    exitCodes.push(shellcheck.exitCode);
  }

  for (const batch of batches) {
    const shfmt = await run.runLoggedCommand(['shfmt', '-d', '--', ...batch], options);

    exitCodes.push(shfmt.exitCode);
  }

  return exitCodes.every((exitCode) => exitCode === 0) ? 0 : 1;
}

// xargs's default command-line size, which fits under ARG_MAX on Linux with room for the env.
const xargsBatchBytes = 128 * 1024;

if (import.meta.main) {
  process.exitCode = await runShellCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    batchBytes: xargsBatchBytes,
  });
}
