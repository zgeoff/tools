import { match } from 'ts-pattern';
import type { LefthookOutcome } from '../../packages/chex/src/build-lefthook-extends.ts';
import { buildLefthookGuard } from '../../packages/chex/src/build-lefthook-guard.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';

export interface LefthookGuardCheckOptions {
  readonly readLefthook: () => Promise<string>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

export async function runLefthookGuardCheck(options: LefthookGuardCheckOptions): Promise<number> {
  let text: string;

  try {
    text = await options.readLefthook();
  } catch (error) {
    options.writeError(
      `lefthook-guard: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }

  const fault = match<LefthookOutcome, string | null>(buildLefthookGuard(text))
    .with({ kind: 'unchanged' }, () => null)
    .with(
      { kind: 'changed' },
      () =>
        'lefthook.yml lacks the chex-baseline job that chex init writes first in pre-commit and pre-push; run bun packages/chex/src/cli.ts init',
    )
    .with({ kind: 'refused' }, (outcome) => outcome.reason)
    .exhaustive();

  if (fault === null) {
    return 0;
  }

  options.writeOutput(`${fault}\n`);

  return 1;
}

async function runCLI(): Promise<void> {
  process.exitCode = await runLefthookGuardCheck({
    readLefthook: () => nodeFileSystem.readText('lefthook.yml'),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
