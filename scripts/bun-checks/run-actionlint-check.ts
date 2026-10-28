import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import type { RunCommand } from '../ci/run-command.ts';

export interface ActionlintCheckRun {
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
export async function runActionlintCheck(run: Readonly<ActionlintCheckRun>): Promise<number> {
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
  process.exitCode = await runActionlintCheck({
    cwd: process.cwd(),
    env: process.env,
    today: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
