import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunProgram } from '../run-program.ts';
import { runProgram } from '../run-program.ts';
import { collectStaleAgeGateExcludes } from './collect-stale-age-gate-excludes.ts';
import { collectUnneededAuditIgnores } from './collect-unneeded-audit-ignores.ts';
import { collectUnneededOverrides } from './collect-unneeded-overrides.ts';
import { parseAuditAdvisories } from './parse-audit-advisories.ts';
import { parseAuditIgnoreIDs } from './parse-audit-ignore-ids.ts';
import { parseFixablePackages } from './parse-fixable-packages.ts';
import { parseLockfileDependents } from './parse-lockfile-dependents.ts';
import { parseRootManifest } from './parse-root-manifest.ts';
import type { DependencyGateFinding } from './types.ts';

export interface DependencyGatesCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  // An ISO date, such as 2026-03-08.
  readonly today: string;

  readonly runProgram: RunProgram;
}

// The audit runs only for a repo that ignores an advisory, so a repo with no ignore needs no
// network.
export function runDependencyGatesCheck(
  options: Readonly<DependencyGatesCheckOptions>,
): DependencyGateFinding[] {
  const manifest = parseRootManifest(readRepoFile(options, 'package.json'));
  const bunfigPath = join(options.cwd, 'bunfig.toml');
  const bunfig = existsSync(bunfigPath) ? readFileSync(bunfigPath, 'utf8') : '';
  const ignoreIDs = parseAuditIgnoreIDs(manifest.auditScript);

  const overrideFindings =
    Object.keys(manifest.overrides).length === 0
      ? []
      : collectUnneededOverrides({
          overrides: manifest.overrides,
          catalog: manifest.catalog,
          dependents: parseLockfileDependents(readRepoFile(options, 'bun.lock')),
        });

  const ignoreFindings =
    ignoreIDs.length === 0
      ? []
      : collectUnneededAuditIgnores({
          ignoreIDs,
          advisories: parseAuditAdvisories(runBun(options, ['audit', '--json'])),
          fixablePackages: parseFixablePackages(
            runBun(options, ['audit', 'fix', '--dry-run', '--json']),
          ),
        });

  return [
    ...collectStaleAgeGateExcludes(bunfig, options.today),
    ...overrideFindings,
    ...ignoreFindings,
  ];
}

function readRepoFile(options: Readonly<DependencyGatesCheckOptions>, path: string): string {
  try {
    return readFileSync(join(options.cwd, path), 'utf8');
  } catch (error) {
    throw new Error(
      `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

// `bun audit` exits 1 while any advisory remains, ignored ones included, so only empty output fails.
function runBun(options: Readonly<DependencyGatesCheckOptions>, args: readonly string[]): string {
  const result = options.runProgram(['bun', ...args], { cwd: options.cwd, env: options.env });

  if (result.stdout.trim() === '') {
    throw new Error(
      `bun ${args.join(' ')} printed nothing and exited ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }

  return result.stdout;
}

function runCLI(): void {
  try {
    const findings = runDependencyGatesCheck({
      cwd: process.cwd(),
      env: process.env,
      today: new Date().toISOString().slice(0, 10),
      runProgram,
    });

    for (const finding of findings) {
      process.stdout.write(`${finding.path}: ${finding.entry}: ${finding.problem}\n`);
    }

    process.exitCode = findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `dependency-gates: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    process.exitCode = 2;
  }
}

if (import.meta.main) {
  runCLI();
}
