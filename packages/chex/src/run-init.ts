import { join } from 'node:path';
import { match } from 'ts-pattern';
import { buildInitPlan } from './build-init-plan.ts';

export interface InitDeps {
  readonly repoRoot: string;

  // Returns undefined for a file that does not exist.
  readonly readText: (path: string) => Promise<string | undefined>;

  readonly writeText: (path: string, text: string) => Promise<void>;

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
      await Promise.all(
        apply.writes.map((write) => deps.writeText(join(deps.repoRoot, write.file), write.text)),
      );

      deps.writeOutput(apply.notes.map((note) => `chex init: ${note}\n`).join(''));

      return 0;
    })
    .exhaustive();
}
