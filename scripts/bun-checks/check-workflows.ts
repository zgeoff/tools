import { $ } from 'bun';
import type { CheckResult } from './check-shell.ts';

export interface WorkflowsCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // The UTC day as YYYYMMDD.
  readonly today: string;
}

// actionlint 1.7.12 rejects the concurrency queue key that GitHub documents, until
// rhysd/actionlint#654 ships. The pre-push workflows job holds the same ignore and date.
const queueIgnoreExpires = '20270122';
const queueIgnore = 'unexpected key "queue" for "concurrency" section';

export async function runWorkflowsCheck(run: Readonly<WorkflowsCheckRun>): Promise<CheckResult> {
  const isIgnoring = run.today < queueIgnoreExpires;

  const result = await (isIgnoring ? $`actionlint -ignore ${queueIgnore}` : $`actionlint`)
    .cwd(run.cwd)
    .env({ ...run.env })
    .nothrow()
    .quiet();

  const notice = isIgnoring
    ? ''
    : `::warning::workflows: the ignore of the concurrency queue key expired on ${queueIgnoreExpires}; move the actionlint pin to a release with rhysd/actionlint#654\n`;

  return {
    exitCode: result.exitCode,
    output: `${notice}${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

if (import.meta.main) {
  const result = await runWorkflowsCheck({
    cwd: process.cwd(),
    env: process.env,
    today: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
  });

  process.stdout.write(result.output);

  process.exitCode = result.exitCode;
}
