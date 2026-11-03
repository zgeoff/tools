import { createLintTree } from './create-lint-tree.ts';
import type { FileTree, RuleSettings } from './create-lint-tree.ts';
import { runLintIn } from './run-lint-in.ts';
import type { OxlintRun } from './run-oxlint.ts';

export async function runLintTree(
  files: FileTree,
  target: string,
  rules: RuleSettings,
): Promise<OxlintRun> {
  const directory = await createLintTree(files, rules);

  return runLintIn(directory, directory, target);
}
