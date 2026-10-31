import { buildInitPackage, docsScript } from './build-init-package.ts';
import { baselinePath, buildLefthookExtends } from './build-lefthook-extends.ts';

export interface InitWrite {
  readonly file: 'lefthook.yml' | 'package.json';
  readonly text: string;
}

export type InitPlan =
  | { readonly kind: 'refused'; readonly reasons: readonly string[] }
  | {
      readonly kind: 'apply';
      readonly writes: readonly InitWrite[];
      readonly notes: readonly string[];
    };

// Plans both edits before either is written, so a refused edit leaves the repo as it was.
export function buildInitPlan(
  packageText: string | undefined,
  lefthookText: string | undefined,
): InitPlan {
  if (packageText === undefined) {
    return {
      kind: 'refused',
      reasons: ['the folder has no package.json; run chex init from the repo root'],
    };
  }

  const packageOutcome = buildInitPackage(packageText);

  if (packageOutcome.kind === 'missing') {
    const packages = packageOutcome.packages;

    return {
      kind: 'refused',
      reasons: [
        `the baseline needs ${packages.join(', ')} installed; run bun add -d ${packages.join(' ')}`,
      ],
    };
  }

  const lefthookOutcome = buildLefthookExtends(lefthookText);

  const reasons = [packageOutcome, lefthookOutcome].flatMap((outcome) =>
    outcome.kind === 'refused' ? [outcome.reason] : [],
  );

  if (reasons.length > 0) {
    return { kind: 'refused', reasons };
  }

  const writes: InitWrite[] = [];
  const notes: string[] = [];

  if (lefthookOutcome.kind === 'changed') {
    writes.push({ file: 'lefthook.yml', text: lefthookOutcome.text });
    notes.push(`lefthook.yml extends ${baselinePath}`);
  }

  if (packageOutcome.kind === 'changed') {
    writes.push({ file: 'package.json', text: packageOutcome.text });
    notes.push(`package.json runs "${docsScript}" as check:docs`);
  }

  if (writes.length === 0) {
    notes.push('the repo already takes the baseline; nothing to change');
  }

  return { kind: 'apply', writes, notes };
}
