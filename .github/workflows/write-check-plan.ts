// The bun-checks plan step: reads the repo's script names and the job's part, plans the check
// scripts, and writes the plan to the step outputs. The caller's runner downloads this file and
// the planner, and installs ts-pattern beside them at the version tools pins.
import { appendFile, readFile } from 'node:fs/promises';
import { match } from 'ts-pattern';
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

process.exitCode = await match(plan)
  .with({ kind: 'missing' }, (missing) => {
    console.log(
      `::error::package.json defines no script named: ${missing.missing.join(' ')}. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.`,
    );

    return 1;
  })
  .with({ kind: 'planned' }, async (planned) => {
    if (planned.notice !== null) {
      console.log(`::notice::${planned.notice}`);
    }

    // Spaces around each list let a later step match one whole name.
    await appendFile(
      outputPath,
      [
        `scripts= ${planned.scripts.join(' ')} `,
        `static= ${planned.static.join(' ')} `,
        `test= ${planned.test.join(' ')} `,
        `lanes=${JSON.stringify(planned.lanes)}`,
        '',
      ].join('\n'),
    );

    return 0;
  })
  .exhaustive();

function readScriptNames(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('scripts' in value)) {
    return [];
  }

  const scripts = value.scripts;

  return typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
}
