import { $ } from 'bun';

export interface ShellCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface CheckResult {
  readonly exitCode: number;

  readonly output: string;
}

// Runs shellcheck and shfmt over every shell script git tracks, and fails on the findings of
// either, after both have run.
export async function runShellCheck(run: Readonly<ShellCheckRun>): Promise<CheckResult> {
  const listed = await $`git ls-files -z -- ${'*.sh'}`
    .cwd(run.cwd)
    .env({ ...run.env })
    .text();

  const scripts = listed.split('\0').filter((path) => path !== '');

  if (scripts.length === 0) {
    return { exitCode: 0, output: 'shell: the repo tracks no shell script\n' };
  }

  const shellcheck =
    await $`shellcheck --external-sources --source-path=SCRIPTDIR ${`--source-path=${run.cwd}`} -- ${scripts}`
      .cwd(run.cwd)
      .env({ ...run.env })
      .nothrow()
      .quiet();

  const shfmt = await $`shfmt -d -- ${scripts}`
    .cwd(run.cwd)
    .env({ ...run.env })
    .nothrow()
    .quiet();

  const results = [shellcheck, shfmt];

  return {
    exitCode: results.every((result) => result.exitCode === 0) ? 0 : 1,
    output: results
      .map((result) => `${result.stdout.toString()}${result.stderr.toString()}`)
      .join(''),
  };
}

if (import.meta.main) {
  const result = await runShellCheck({ cwd: process.cwd(), env: process.env });

  process.stdout.write(result.output);

  process.exitCode = result.exitCode;
}
