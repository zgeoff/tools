import { join } from 'node:path';
import { runOxlint } from './run-oxlint.ts';
import type { OxlintRun } from './run-oxlint.ts';

export function runLintIn(directory: string, cwd: string, target: string): Promise<OxlintRun> {
  return runOxlint(
    [
      '-c',
      join(directory, '.oxlintrc.json'),
      '--report-unused-disable-directives-severity',
      'error',
      target,
    ],
    cwd,
  );
}
