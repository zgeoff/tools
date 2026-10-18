import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// A parse error: `path:line:column: message`.
const SHFMT_ERROR_LINE = /^(?<path>.+?):(?<line>\d+):\d+: (?<message>.*)$/u;
const DIFF_TARGET_LINE = /^\+\+\+ (?<path>.+)$/u;
const HUNK_HEADER = /^@@ -(?<start>\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/u;

// Turns one shfmt -d run into findings: one per diff hunk and one per parse error. A run that
// did not check every file throws instead, so the caller never reads it as a clean result.
export function parseShfmtOutput(result: ProgramResult): Finding[] {
  // shfmt exits 1 for a diff, a parse error, and an unreadable file alike. Any exit above 1, or any
  // stderr line that is not a parse error, means a file went unchecked, so the run fails even when
  // other files gave findings.
  const stderrLines = result.stderr.split('\n').filter((line) => line.trim() !== '');
  const failures = stderrLines.filter((line) => !SHFMT_ERROR_LINE.test(line));

  if (result.exitCode > 1 || failures.length > 0) {
    throw new Error(`shell: shfmt failed: ${result.stderr.trim()}`);
  }

  const errors = stderrLines.flatMap((line) => {
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

  // An exit of 1 with neither a diff nor a parse error is a crash.
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
