import type { RunCommand } from '../ci/run-command.ts';
import { runLoggedCommand } from '../ci/run-logged-command.ts';

export interface WorkflowsCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // The UTC day as YYYYMMDD.
  readonly today: string;

  // Runs actionlint, whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

// actionlint 1.7.12 rejects the concurrency queue key that GitHub documents, until
// rhysd/actionlint#654 ships. The pre-push workflows job holds the same ignore and date.
const queueIgnoreExpires = '20270122';
const queueIgnore = 'unexpected key "queue" for "concurrency" section';

// Returns actionlint's exit code.
export async function runWorkflowsCheck(run: Readonly<WorkflowsCheckRun>): Promise<number> {
  const isIgnoring = run.today < queueIgnoreExpires;

  if (!isIgnoring) {
    run.writeOutput(
      `::warning::workflows: the ignore of the concurrency queue key expired on ${queueIgnoreExpires}; move the actionlint pin to a release with rhysd/actionlint#654\n`,
    );
  }

  const argv = isIgnoring ? ['actionlint', '-ignore', queueIgnore] : ['actionlint'];

  const result = await run.runLoggedCommand(argv, { cwd: run.cwd, env: run.env });

  return result.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runWorkflowsCheck({
    cwd: process.cwd(),
    env: process.env,
    today: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
    runLoggedCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
