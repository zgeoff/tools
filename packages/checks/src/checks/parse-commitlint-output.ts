import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// Turns one commitlint run over the message of the commit `hash` into findings, one per problem,
// each at line 1 of the commit. A run that did not lint the message throws instead, so the caller
// never reads it as a clean result.
export function parseCommitlintOutput(hash: string, result: ProgramResult): Finding[] {
  // The default formatter: `✖   subject may not be empty [subject-empty]`. The summary line,
  // `✖   found 1 problems, 0 warnings`, ends with no rule name.
  const problemLine = /^✖\s+(?<message>.+ \[[\w-]+\])$/u;

  // commitlint exits 1 when it reports a problem, and with other codes when it cannot run, such as
  // 9 for a config with no rules.
  if (result.exitCode > 1) {
    throw new Error(`commits: commitlint failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const findings = result.stdout.split('\n').flatMap((line) => {
    const groups = problemLine.exec(line)?.groups;

    if (groups === undefined) {
      return [];
    }

    return [{ path: hash, line: 1, message: `commitlint: ${groups['message']}` }];
  });

  // An exit of 1 with no problem it could read is a crash, such as a config it cannot load.
  if (result.exitCode === 1 && findings.length === 0) {
    throw new Error(`commits: commitlint failed: ${result.stderr.trim()}`);
  }

  return findings;
}
