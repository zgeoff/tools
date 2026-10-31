import { buildInitPackage, docsScript } from './build-init-package.ts';
import { baselinePath, buildLefthookExtends } from './build-lefthook-extends.ts';
import { matchKind } from './match-kind.ts';

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

  return matchKind<ReturnType<typeof buildInitPackage>, InitPlan>(buildInitPackage(packageText), {
    missing: (outcome) => ({
      kind: 'refused',
      reasons: [
        `the baseline needs ${outcome.packages.join(', ')} installed; run bun add -d ${outcome.packages.join(' ')}`,
      ],
    }),
    unchanged: () => buildPlanFromSteps([buildLefthookStep(lefthookText)]),
    changed: (outcome) =>
      buildPlanFromSteps([
        buildLefthookStep(lefthookText),
        {
          reasons: [],
          writes: [{ file: 'package.json', text: outcome.text }],
          notes: [`package.json runs "${docsScript}" as check:docs`],
        },
      ]),
    refused: (outcome) =>
      buildPlanFromSteps([
        buildLefthookStep(lefthookText),
        { reasons: [outcome.reason], writes: [], notes: [] },
      ]),
  });
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

const keptStep: InitStep = { reasons: [], writes: [], notes: [] };

function buildLefthookStep(lefthookText: string | undefined): InitStep {
  return matchKind(buildLefthookExtends(lefthookText), {
    unchanged: () => keptStep,
    changed: (outcome) => ({
      reasons: [],
      writes: [{ file: 'lefthook.yml', text: outcome.text }],
      notes: [`lefthook.yml extends ${baselinePath}`],
    }),
    refused: (outcome) => ({ reasons: [outcome.reason], writes: [], notes: [] }),
  });
}
