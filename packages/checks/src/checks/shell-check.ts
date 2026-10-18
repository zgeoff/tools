import { runProgram } from '../run-program.ts';
import type { Check, CheckContext, Finding } from '../types.ts';

// shellcheck and `shfmt -d` over every shell script. shfmt runs with no style flags, so it reads
// the repo's .editorconfig.
export const shellCheck: Check = {
  name: 'shell',
  glob: '**/*.sh',
  check: checkShellFiles,
};

// Each program gets the files in batches, so a large repo stays under the argument-length limit.
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

// A parse error: `path:line:column: message`.
const SHFMT_ERROR_LINE = /^(?<path>.+?):(?<line>\d+):\d+: (?<message>.*)$/u;
const DIFF_TARGET_LINE = /^\+\+\+ (?<path>.+)$/u;
const HUNK_HEADER = /^@@ -(?<start>\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/u;

function runShfmt(context: CheckContext, files: readonly string[]): Finding[] {
  const result = runProgram('shell', context, ['shfmt', '-d', '--', ...files]);

  const errors = result.stderr.split('\n').flatMap((line) => {
    const groups = SHFMT_ERROR_LINE.exec(line)?.groups;

    if (groups === undefined) {
      return [];
    }

    return [
      {
        path: groups['path'] ?? '',
        line: Number(groups['line']),
        message: `shfmt cannot parse the file: ${groups['message']}`,
      },
    ];
  });

  const diffs = collectDiffFindings(result.stdout);

  // shfmt exits 1 for both a diff and a parse error, so a failure with neither is a crash.
  if (result.exitCode !== 0 && errors.length === 0 && diffs.length === 0) {
    throw new Error(`shell: shfmt failed: ${result.stderr.trim()}`);
  }

  return [...errors, ...diffs];
}

// One finding per hunk of shfmt's unified diff, at the first line that the hunk changes.
function collectDiffFindings(diff: string): Finding[] {
  const findings: Finding[] = [];
  let path = '';
  let line = 0;
  let reported = true;

  for (const text of diff.split('\n')) {
    const target = DIFF_TARGET_LINE.exec(text)?.groups;

    if (target !== undefined) {
      path = target['path'] ?? '';
      continue;
    }

    const hunk = HUNK_HEADER.exec(text)?.groups;

    if (hunk !== undefined) {
      line = Number(hunk['start']);
      reported = false;
      continue;
    }

    if (reported || text.startsWith('---')) {
      continue;
    }

    if (text.startsWith('-') || text.startsWith('+')) {
      findings.push({
        path,
        line,
        message: `shfmt would reformat this hunk; run shfmt -w ${path} to fix it`,
      });

      reported = true;
    } else if (text.startsWith(' ')) {
      line += 1;
    }
  }

  return findings;
}
