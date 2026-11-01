import { match } from 'ts-pattern';
import type { PackageOutcome } from './build-init-package.ts';
import { buildInitPackage, docsScript } from './build-init-package.ts';
import type { LefthookOutcome } from './build-lefthook-extends.ts';
import { baselinePath, buildLefthookExtends } from './build-lefthook-extends.ts';
import { buildLefthookGuard, guardName, guardedHooks } from './build-lefthook-guard.ts';

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

  return match<PackageOutcome, InitPlan>(buildInitPackage(packageText))
    .with({ kind: 'missing' }, (outcome) => ({
      kind: 'refused',
      reasons: [
        `the baseline needs ${outcome.packages.join(', ')} installed; run bun add -d ${outcome.packages.join(' ')}`,
      ],
    }))
    .with({ kind: 'unchanged' }, () => buildPlanFromSteps([buildLefthookStep(lefthookText)]))
    .with({ kind: 'changed' }, (outcome) =>
      buildPlanFromSteps([
        buildLefthookStep(lefthookText),
        {
          reasons: [],
          writes: [{ file: 'package.json', text: outcome.text }],
          notes: [`package.json runs "${docsScript}" as check:docs`],
        },
      ]),
    )
    .with({ kind: 'refused' }, (outcome) =>
      buildPlanFromSteps([
        buildLefthookStep(lefthookText),
        { reasons: [outcome.reason], writes: [], notes: [] },
      ]),
    )
    .exhaustive();
}

interface InitStep {
  readonly reasons: readonly string[];
  readonly writes: readonly InitWrite[];
  readonly notes: readonly string[];
}

function buildPlanFromSteps(steps: readonly InitStep[]): InitPlan {
  const reasons = steps.flatMap((step) => step.reasons);

  if (reasons.length > 0) {
    return { kind: 'refused', reasons };
  }

  const writes = steps.flatMap((step) => step.writes);

  return {
    kind: 'apply',
    writes,
    notes:
      writes.length === 0
        ? ['the repo already takes the baseline; nothing to change']
        : steps.flatMap((step) => step.notes),
  };
}

function buildLefthookStep(lefthookText: string | undefined): InitStep {
  return match<LefthookOutcome, InitStep>(buildLefthookExtends(lefthookText))
    .with({ kind: 'unchanged' }, (outcome) => buildGuardStep(outcome.text, []))
    .with({ kind: 'changed' }, (outcome) =>
      buildGuardStep(outcome.text, [`lefthook.yml extends ${baselinePath}`]),
    )
    .with({ kind: 'refused' }, (outcome) => ({ reasons: [outcome.reason], writes: [], notes: [] }))
    .exhaustive();
}

const keptStep: InitStep = { reasons: [], writes: [], notes: [] };

function buildGuardStep(text: string, notes: readonly string[]): InitStep {
  return match<LefthookOutcome, InitStep>(buildLefthookGuard(text))
    .with({ kind: 'unchanged' }, () =>
      notes.length === 0
        ? keptStep
        : { reasons: [], writes: [{ file: 'lefthook.yml', text }], notes },
    )
    .with({ kind: 'changed' }, (outcome) => ({
      reasons: [],
      writes: [{ file: 'lefthook.yml', text: outcome.text }],
      notes: [
        ...notes,
        `lefthook.yml runs ${guardName} first in ${guardedHooks.join(' and ')}, which fails when ${baselinePath} is missing`,
      ],
    }))
    .with({ kind: 'refused' }, (outcome) => ({ reasons: [outcome.reason], writes: [], notes: [] }))
    .exhaustive();
}
