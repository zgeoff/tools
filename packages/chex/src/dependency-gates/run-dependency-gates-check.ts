import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProgram } from '../run-program.ts';
import type { DependencyGateSources } from './read-dependency-gate-findings.ts';
import { readDependencyGateFindings } from './read-dependency-gate-findings.ts';

export interface DependencyGatesCheck extends DependencyGateSources {
  readonly writeOutput: (text: string) => void;
  readonly writeError: (text: string) => void;
}

export async function runDependencyGatesCheck(
  check: Readonly<DependencyGatesCheck>,
): Promise<number> {
  try {
    const findings = await readDependencyGateFindings(check);

    for (const finding of findings) {
      check.writeOutput(`${finding.path}: ${finding.entry}: ${finding.problem}\n`);
    }

    return findings.length === 0 ? 0 : 1;
  } catch (error) {
    check.writeError(
      `dependency-gates: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}

export function runDependencyGatesCommand(): Promise<number> {
  const cwd = process.cwd();

  return runDependencyGatesCheck({
    cwd,
    env: process.env,
    today: new Date().toISOString().slice(0, 10),
    nowMs: Date.now(),
    runProgram,
    readRegistry: (url) => fetch(url),
    readRepoFile: (path) => {
      const fullPath = join(cwd, path);

      return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : null;
    },
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  process.exitCode = await runDependencyGatesCommand();
}
