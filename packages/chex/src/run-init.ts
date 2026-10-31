import { join } from 'node:path';
import { buildInitPackage, docsScript } from './build-init-package.ts';
import { baselinePath, buildLefthookExtends } from './build-lefthook-extends.ts';

export interface InitDeps {
  readonly repoRoot: string;

  // Returns null for a file that does not exist.
  readonly readText: (path: string) => Promise<string | null>;

  readonly writeText: (path: string, text: string) => Promise<void>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// Plans both edits before it writes either, so a refused edit leaves the repo as it was.
export async function runInit(deps: InitDeps): Promise<number> {
  const packagePath = join(deps.repoRoot, 'package.json');
  const lefthookPath = join(deps.repoRoot, 'lefthook.yml');

  const packageText = await deps.readText(packagePath);

  if (packageText === null) {
    deps.writeError(
      'chex init: the folder has no package.json; run chex init from the repo root\n',
    );

    return 1;
  }

  const packageOutcome = buildInitPackage(packageText);

  if (packageOutcome.kind === 'missing') {
    deps.writeError(
      `chex init: the baseline needs ${packageOutcome.packages.join(', ')} installed; run bun add -d ${packageOutcome.packages.join(' ')}\n`,
    );

    return 1;
  }

  const lefthookText = await deps.readText(lefthookPath);

  const lefthookOutcome = buildLefthookExtends(lefthookText);

  const refusals = [packageOutcome, lefthookOutcome].flatMap((outcome) =>
    outcome.kind === 'refused' ? [outcome.reason] : [],
  );

  if (refusals.length > 0) {
    deps.writeError(refusals.map((reason) => `chex init: ${reason}\n`).join(''));

    return 1;
  }

  if (lefthookOutcome.kind === 'changed') {
    await deps.writeText(lefthookPath, lefthookOutcome.text);

    deps.writeOutput(`chex init: lefthook.yml extends ${baselinePath}\n`);
  }

  if (packageOutcome.kind === 'changed') {
    await deps.writeText(packagePath, packageOutcome.text);

    deps.writeOutput(`chex init: package.json runs "${docsScript}" as check:docs\n`);
  }

  if (lefthookOutcome.kind === 'unchanged' && packageOutcome.kind === 'unchanged') {
    deps.writeOutput('chex init: the repo already takes the baseline; nothing to change\n');
  }

  return 0;
}
