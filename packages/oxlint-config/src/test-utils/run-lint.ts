import { createLintTree } from './create-lint-tree.ts';
import type { RuleSettings } from './create-lint-tree.ts';
import { runOxlint } from './run-oxlint.ts';
import type { OxlintRun } from './run-oxlint.ts';

export async function runLint(source: string, rules: RuleSettings): Promise<OxlintRun> {
  const directory = await createLintTree({ 'sample.ts': source }, rules);

  return runOxlint(['-c', '.oxlintrc.json', 'sample.ts'], directory);
}
