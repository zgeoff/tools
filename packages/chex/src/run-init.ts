import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { InitWrite } from './build-init-plan.ts';
import { buildInitPlan } from './build-init-plan.ts';

export interface InitDeps {
  readonly repoRoot: string;

  // Returns undefined for a file that does not exist.
  readonly readText: (path: string) => Promise<string | undefined>;

  readonly writeText: (path: string, text: string) => Promise<void>;

  readonly removeFile: (path: string) => Promise<void>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

export async function runInit(deps: InitDeps): Promise<number> {
  const packageText = await deps.readText(join(deps.repoRoot, 'package.json'));
  const lefthookText = await deps.readText(join(deps.repoRoot, 'lefthook.yml'));

  const plan = buildInitPlan(packageText, lefthookText);

  return match(plan)
    .with({ kind: 'refused' }, (refusal) => {
      deps.writeError(refusal.reasons.map((reason) => `chex init: ${reason}\n`).join(''));

      return Promise.resolve(1);
    })
    .with({ kind: 'apply' }, async (apply) => {
      const originals = { 'package.json': packageText, 'lefthook.yml': lefthookText };
      const written: InitWrite[] = [];

      for (const write of apply.writes) {
        const failure = await deps.writeText(join(deps.repoRoot, write.file), write.text).then(
          () => null,
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        );

        if (failure !== null) {
          await restoreFiles(written, originals, deps);

          deps.writeError(
            `chex init: could not write ${write.file}, so both files stay as they were: ${failure}\n`,
          );

          return 1;
        }

        written.push(write);
      }

      deps.writeOutput(apply.notes.map((note) => `chex init: ${note}\n`).join(''));

      return 0;
    })
    .exhaustive();
}

async function restoreFiles(
  written: readonly InitWrite[],
  originals: Readonly<Record<InitWrite['file'], string | undefined>>,
  deps: InitDeps,
): Promise<void> {
  for (const write of written) {
    const path = join(deps.repoRoot, write.file);
    const original = originals[write.file];

    await (original === undefined ? deps.removeFile(path) : deps.writeText(path, original));
  }
}
