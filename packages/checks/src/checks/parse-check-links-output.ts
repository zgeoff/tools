import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// check-links prints each broken link to stderr as path:line: (target) problem.
const BROKEN_LINK = /^(?<path>.+?):(?<line>\d+): (?<message>.+)$/u;

export function parseCheckLinksOutput(result: ProgramResult): Finding[] {
  // check-links exits 1 when a link is broken; any other failure is perl dying on a file it reads.
  if (result.exitCode > 1) {
    throw new Error(`docs: check-links failed: ${result.stderr.trim()}`);
  }

  if (result.exitCode === 0) {
    return [];
  }

  const findings = result.stderr.split('\n').flatMap((line): Finding[] => {
    const groups = BROKEN_LINK.exec(line)?.groups;

    if (
      groups?.['path'] === undefined ||
      groups['line'] === undefined ||
      groups['message'] === undefined
    ) {
      return [];
    }

    return [
      {
        path: groups['path'],
        line: Number(groups['line']),
        message: `check-links: ${groups['message']}`,
      },
    ];
  });

  if (findings.length === 0) {
    throw new Error(
      `docs: check-links failed, and it printed no broken link the check can read:\n${result.stderr.trim()}`,
    );
  }

  return findings;
}
