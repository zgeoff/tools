import { runProgram } from '../run-program.ts';
import type { Check, CheckContext, Finding } from '../types.ts';
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

// gcc format: `path:line:column: level: message [SC1234]`.
const SHELLCHECK_LINE = /^(?<path>.+?):(?<line>\d+):\d+: (?<level>\w+): (?<message>.*)$/u;

function runShellcheck(context: CheckContext, files: readonly string[]): Finding[] {
  const result = runProgram('shell', context, ['shellcheck', '--format=gcc', '--', ...files]);

  // shellcheck exits 1 when it reports a problem, and above 1 when it cannot run.
  if (result.exitCode > 1) {
    throw new Error(`shell: shellcheck failed: ${result.stderr.trim()}`);
  }

  return result.stdout.split('\n').flatMap((line) => {
    const groups = SHELLCHECK_LINE.exec(line)?.groups;

    if (groups === undefined) {
      return [];
    }

    return [
      {
        path: groups['path'] ?? '',
        line: Number(groups['line']),
        message: `shellcheck ${groups['level']}: ${groups['message']}`,
      },
    ];
  });
}

function runShfmt(context: CheckContext, files: readonly string[]): Finding[] {
  const result = runProgram('shell', context, ['shfmt', '-d', '--', ...files]);

  return parseShfmtOutput(result);
}
