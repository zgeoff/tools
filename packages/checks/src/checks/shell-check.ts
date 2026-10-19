import { runProgram } from '../run-program.ts';
import type { Check, CheckContext, Finding } from '../types.ts';
import { parseShellcheckOutput } from './parse-shellcheck-output.ts';
import { parseShfmtOutput } from './parse-shfmt-output.ts';

// shellcheck and `shfmt -d` over every shell script. shfmt runs with no style flags, so it reads
// the repo's .editorconfig.
export const shellCheck: Check = {
  name: 'shell',
  glob: '**/*.sh',
  check: checkShellFiles,
};

// Each program gets the files in batches, so a large repo stays under the argument-length limit.
// Every batch runs both programs, so a file past the first batch gets the same checks.
const BATCH_SIZE = 200;

function checkShellFiles(context: CheckContext): Finding[] {
  // FORCE_COLOR makes shfmt color its diff even into a pipe, and the parsers read plain text only.
  const plain: CheckContext = {
    ...context,
    env: Object.fromEntries(Object.entries(context.env).filter(([name]) => name !== 'FORCE_COLOR')),
  };

  const findings: Finding[] = [];

  for (let start = 0; start < plain.files.length; start += BATCH_SIZE) {
    const batch = plain.files.slice(start, start + BATCH_SIZE);

    findings.push(...runShellcheck(plain, batch), ...runShfmt(plain, batch));
  }

  return findings;
}

// --external-sources lets shellcheck read a sourced file from disk, so a source whose target sits
// in another batch, or in no batch, still resolves. It looks beside the script, then in the repo
// root.
function runShellcheck(context: CheckContext, files: readonly string[]): Finding[] {
  const result = runProgram('shell', context, [
    'shellcheck',
    '--format=gcc',
    '--external-sources',
    '--source-path=SCRIPTDIR',
    `--source-path=${context.cwd}`,
    '--',
    ...files,
  ]);

  return parseShellcheckOutput(result);
}

function runShfmt(context: CheckContext, files: readonly string[]): Finding[] {
  const result = runProgram('shell', context, ['shfmt', '-d', '--', ...files]);

  return parseShfmtOutput(result);
}
