// The bun-checks plan step: reads the repo's script names and the job's part, plans the check
// scripts, and writes the plan to the step outputs. The caller's runner downloads this file and
// the planner beside it on their own, so it imports nothing else.
import { appendFile, readFile } from 'node:fs/promises';
import type { CheckPart } from './plan-check-scripts.ts';
import { planCheckScripts } from './plan-check-scripts.ts';

const parts: readonly CheckPart[] = ['all', 'static', 'test', 'lane'];
const partName = process.env['PART'] ?? '';
const part = parts.find((candidate) => candidate === partName);
const outputPath = process.env['GITHUB_OUTPUT'] ?? '';

if (part === undefined || outputPath === '') {
  console.log(`::error::the plan step needs PART (one of ${parts.join(', ')}) and GITHUB_OUTPUT.`);
  process.exit(1);
}

const packageText = await readFile('package.json', 'utf8');

const packageJSON: unknown = JSON.parse(packageText);

const plan = planCheckScripts({
  scripts: process.env['SCRIPTS'] ?? '',
  defined: readScriptNames(packageJSON),
  part,
  lane: process.env['LANE'] ?? '',
});

if (plan.kind === 'missing') {
  console.log(
    `::error::package.json defines no script named: ${plan.missing.join(' ')}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`,
  );

  process.exit(1);
}

if (plan.notice !== null) {
  console.log(`::notice::${plan.notice}`);
}

// Spaces around each list let a later step match one whole name.
await appendFile(
  outputPath,
  [
    `scripts= ${plan.scripts.join(' ')} `,
    `static= ${plan.static.join(' ')} `,
    `test= ${plan.test.join(' ')} `,
    `lanes=${JSON.stringify(plan.lanes)}`,
    '',
  ].join('\n'),
);

function readScriptNames(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('scripts' in value)) {
    return [];
  }

  const scripts = value.scripts;

  return typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
}
