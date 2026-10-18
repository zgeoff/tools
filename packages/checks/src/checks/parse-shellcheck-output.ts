import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// Turns one shellcheck --format=gcc run into findings, one per reported problem. A run that did not
// check every file throws instead, so the caller never reads it as a clean result.
export function parseShellcheckOutput(result: ProgramResult): Finding[] {
  // gcc format: `path:line:column: level: message [SC1234]`.
  const problemLine = /^(?<path>.+?):(?<line>\d+):\d+: (?<level>\w+): (?<message>.*)$/u;

  // shellcheck exits 1 when it reports a problem, and above 1 when it cannot run.
  if (result.exitCode > 1) {
    throw new Error(`shell: shellcheck failed: ${result.stderr.trim()}`);
  }

  const findings = result.stdout.split('\n').flatMap((line) => {
    const groups = problemLine.exec(line)?.groups;

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

  // An exit of 1 with no problem it could read is a crash, not a clean run.
  if (result.exitCode === 1 && findings.length === 0) {
    throw new Error(`shell: shellcheck failed: ${result.stderr.trim()}`);
  }

  return findings;
}
