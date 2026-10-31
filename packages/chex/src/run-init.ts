import { join } from 'node:path';
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

  if (plan.kind === 'refused') {
    deps.writeError(plan.reasons.map((reason) => `chex init: ${reason}\n`).join(''));

    return 1;
  }

  await Promise.all(
    plan.writes.map((write) => deps.writeText(join(deps.repoRoot, write.file), write.text)),
  );

  deps.writeOutput(plan.notes.map((note) => `chex init: ${note}\n`).join(''));

  return 0;
}
