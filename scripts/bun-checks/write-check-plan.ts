import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import type { CheckPart } from './plan-check-scripts.ts';
import { planCheckScripts } from './plan-check-scripts.ts';

export interface CheckPlanStep {
  readonly cwd: string;

  readonly outputPath: string;

  readonly part: string;

  readonly scripts: string;

  readonly lane: string;

  readonly fileSystem: FileSystem;
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

  const plan = planCheckScripts({
    scripts: step.scripts,
    defined: readScriptNames(packageJSON),
    part,
    lane: step.lane,
  });

  if (plan.kind === 'missing') {
    return [
      `package.json defines no script named: ${plan.missing.join(' ')}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`,
    ];
  }

  // Spaces around each list let a later step match one whole name.
  await writeStepOutputs(step.fileSystem, step.outputPath, {
    scripts: ` ${plan.scripts.join(' ')} `,
    static: ` ${plan.static.join(' ')} `,
    test: ` ${plan.test.join(' ')} `,
    lanes: JSON.stringify(plan.lanes),
  });

  return [];
}

function readScriptNames(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('scripts' in value)) {
    return [];
  }

  const scripts = value.scripts;

  return typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
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
