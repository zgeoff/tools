import { join } from 'node:path';
import { $ } from 'bun';
import type { CheckResult } from './check-shell.ts';

export interface DocsCheckRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;
}

const scriptsFolder = '.claude/skills/docs-writing/scripts';
const checkScripts = ['check-length.sh', 'check-links.sh'];

// The docs-writing skill's scripts pick the docs they read themselves. Each one runs even after
// another fails, so the log names every check that fails.
export async function runDocsCheck(run: Readonly<DocsCheckRun>): Promise<CheckResult> {
  if (!(await Bun.file(join(run.cwd, scriptsFolder, 'check-length.sh')).exists())) {
    return {
      exitCode: 0,
      output: `::notice::docs: skipped, because the repo has no ${scriptsFolder}/check-length.sh; take the skill-docs-writing entry of repo-sync to run it\n`,
    };
  }

  const outputs: string[] = [];
  let exitCode = 0;

  for (const script of checkScripts) {
    const result = await $`bash ${join(scriptsFolder, script)}`
      .cwd(run.cwd)
      .env({ ...run.env })
      .nothrow()
      .quiet();

    outputs.push(`${result.stdout.toString()}${result.stderr.toString()}`);

    if (result.exitCode !== 0) {
      outputs.push(
        `::error::docs: ${script} failed; its output above holds each failing file and its fault\n`,
      );

      exitCode = 1;
    }
  }

  return { exitCode, output: outputs.join('') };
}

if (import.meta.main) {
  const result = await runDocsCheck({ cwd: process.cwd(), env: process.env });

  process.stdout.write(result.output);

  process.exitCode = result.exitCode;
}
