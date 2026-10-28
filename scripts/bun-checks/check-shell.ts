import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';

export interface ShellCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runCommand: RunCommand;
}

export interface CheckResult {
  readonly exitCode: number;

  readonly output: string;
}

// Runs shellcheck and shfmt over every shell script git tracks, and fails on the findings of
// either, after both have run.
export async function runShellCheck(run: Readonly<ShellCheckRun>): Promise<CheckResult> {
  const options = { cwd: run.cwd, env: run.env };

  const listed = await runCheckedCommand(
    run.runCommand,
    ['git', 'ls-files', '-z', '--', '*.sh'],
    options,
  );

  const scripts = listed.stdout.split('\0').filter((path) => path !== '');

  if (scripts.length === 0) {
    return { exitCode: 0, output: 'shell: the repo tracks no shell script\n' };
  }

  const shellcheck = await run.runCommand(
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

  const shfmt = await run.runCommand(['shfmt', '-d', '--', ...scripts], options);

  const results = [shellcheck, shfmt];

  return {
    exitCode: results.every((result) => result.exitCode === 0) ? 0 : 1,
    output: results.map((result) => `${result.stdout}${result.stderr}`).join(''),
  };
}

if (import.meta.main) {
  const result = await runShellCheck({ cwd: process.cwd(), env: process.env, runCommand });

  process.stdout.write(result.output);

  process.exitCode = result.exitCode;
}
