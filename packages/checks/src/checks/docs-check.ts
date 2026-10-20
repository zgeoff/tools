import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runProgram } from '../run-program.ts';
import type { CheckContext, FileCheck, Finding } from '../types.ts';
import { parseCheckLengthOutput } from './parse-check-length-output.ts';
import { parseCheckLinksOutput } from './parse-check-links-output.ts';

// The docs-writing skill's own scripts. check-length runs check-prose, and check-skill when the
// repo has the skill-writing skill, so a second run of either would report each problem twice. Each
// script picks the files it reads, so the glob only decides whether the check runs.
export const docsCheck: FileCheck = {
  kind: 'files',
  name: 'docs',
  glob: '**/*.md',
  check: checkDocs,
};

// repo-sync delivers the scripts to .claude/skills, and tools keeps their sources under sync/skills.
const SCRIPT_FOLDERS = ['.claude/skills/docs-writing/scripts', 'sync/skills/docs-writing/scripts'];

function checkDocs(context: CheckContext): Finding[] {
  const folder = resolveScriptFolder(context.cwd);
  const length = runProgram('docs', context, ['bash', join(folder, 'check-length.sh')]);
  const links = runProgram('docs', context, ['bash', join(folder, 'check-links.sh')]);

  return [...parseCheckLengthOutput(length), ...parseCheckLinksOutput(links)];
}

function resolveScriptFolder(cwd: string): string {
  const folder = SCRIPT_FOLDERS.find((candidate) =>
    existsSync(join(cwd, candidate, 'check-length.sh')),
  );

  if (folder === undefined) {
    throw new Error(
      `docs: the repo has no ${SCRIPT_FOLDERS[0]}/check-length.sh, and the docs check runs it. Take the skill-docs-writing entry of repo-sync, or turn the docs check off in zgeoff-check.json.`,
    );
  }

  return join(cwd, folder);
}
