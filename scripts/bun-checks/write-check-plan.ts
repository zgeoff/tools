import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { parseDocsChecks } from './parse-docs-checks.ts';
import type { CheckPart, CheckPlan } from './plan-check-scripts.ts';
import { planCheckScripts } from './plan-check-scripts.ts';

export interface CheckPlanStep {
  readonly cwd: string;

  readonly outputPath: string;

  readonly part: string;

  readonly scripts: string;

  readonly lane: string;

  readonly fileSystem: Pick<FileSystem, 'appendText' | 'readText'>;
}

const parts: readonly CheckPart[] = ['all', 'static', 'test', 'lane'];

// Returns the errors that fail the step; with none, the plan is in the step outputs.
export async function writeCheckPlan(step: Readonly<CheckPlanStep>): Promise<string[]> {
  const part = parts.find((candidate) => candidate === step.part);

  if (part === undefined || step.outputPath === '') {
    return [`the plan step needs PART (one of ${parts.join(', ')}) and GITHUB_OUTPUT.`];
  }

  const packageText = await step.fileSystem.readText(join(step.cwd, 'package.json'));

  const packageJSON: unknown = JSON.parse(packageText);
  const scripts = findScripts(packageJSON);
  const docsScript = scripts['check:docs'];
  const docsText = typeof docsScript === 'string' ? docsScript : undefined;
  const docs = parseDocsChecks(docsText);

  if (docs.kind === 'refused') {
    return [docs.message];
  }

  const plan = planCheckScripts({
    scripts: step.scripts,
    defined: Object.keys(scripts),
    part,
    lane: step.lane,
  });

  // An empty docs output runs the docs step that reads the docs scripts repo-sync delivers.
  const docsOutput = docs.kind === 'named' ? ` ${docs.checks.join(' ')} ` : '';

  return writePlanOutcome(plan, docsOutput, step);
}

function findScripts(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || !('scripts' in value)) {
    return {};
  }

  const scripts = value.scripts;

  return typeof scripts === 'object' && scripts !== null ? { ...scripts } : {};
}

type CheckPlanOf<Kind extends CheckPlan['kind']> = Extract<CheckPlan, { readonly kind: Kind }>;

type PlanOutcomeWriter<Kind extends CheckPlan['kind']> = (
  plan: CheckPlanOf<Kind>,
  docs: string,
  step: Readonly<CheckPlanStep>,
) => Promise<string[]>;

// A table typed over every plan kind, so a new kind fails the type check until it has an outcome.
const planOutcomeWriters: { readonly [Kind in CheckPlan['kind']]: PlanOutcomeWriter<Kind> } = {
  missing: (plan) =>
    Promise.resolve([
      `package.json defines no script named: ${plan.missing.join(' ')}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`,
    ]),
  planned: async (plan, docs, step) => {
    // Spaces around each list let a later step match one whole name.
    await writeStepOutputs(step.fileSystem, step.outputPath, {
      scripts: ` ${plan.scripts.join(' ')} `,
      static: ` ${plan.static.join(' ')} `,
      test: ` ${plan.test.join(' ')} `,
      lanes: JSON.stringify(plan.lanes),
      docs,
    });

    return [];
  },
};

function writePlanOutcome<Kind extends CheckPlan['kind']>(
  plan: CheckPlanOf<Kind>,
  docs: string,
  step: Readonly<CheckPlanStep>,
): Promise<string[]> {
  const writeOutcome: PlanOutcomeWriter<Kind> = planOutcomeWriters[plan.kind];

  return writeOutcome(plan, docs, step);
}

if (import.meta.main) {
  const errors = await writeCheckPlan({
    cwd: process.cwd(),
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
    part: process.env['PART'] ?? '',
    scripts: process.env['SCRIPTS'] ?? '',
    lane: process.env['LANE'] ?? '',
    fileSystem: nodeFileSystem,
  });

  for (const error of errors) {
    process.stdout.write(`::error::${error}\n`);
  }

  process.exitCode = errors.length === 0 ? 0 : 1;
}
