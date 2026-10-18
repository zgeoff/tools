#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { allChecks } from './all-checks.ts';
import { loadConfig } from './load-config.ts';
import { runChecks } from './run-checks.ts';

// Exit codes: 0 with no finding, 1 with any finding, 2 when the run itself fails.
const USAGE = `usage: zgeoff-check [file ...]

Runs every check over the files that git tracks, or over the files given.
Each finding prints as path:line: <check>: <message>.
Checks: ${allChecks.map((check) => check.name).join(', ')}`;

const args = process.argv.slice(2);

// Bun drops the first -- from the arguments before this module runs, so the runner cannot tell a
// file after -- from an option. Help therefore prints only for a lone --help, and a dash argument
// that names no file stops the run instead of passing as an empty list.
if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const files = args.filter((arg) => arg !== '--');
const unknownOption = files.find((arg) => arg.startsWith('-') && !existsSync(arg));

if (unknownOption !== undefined) {
  process.stderr.write(`zgeoff-check: unknown option ${unknownOption}\n${USAGE}\n`);
  process.exit(2);
}

try {
  const cwd = process.cwd();

  const config = loadConfig(
    cwd,
    allChecks.map((check) => check.name),
  );

  const findings = await runChecks({
    cwd,
    checks: allChecks,
    config,
    env: process.env,
    ...(files.length === 0 ? {} : { files }),
  });

  for (const finding of findings) {
    process.stdout.write(`${finding.path}:${finding.line}: ${finding.check}: ${finding.message}\n`);
  }

  const exitCode = findings.length === 0 ? 0 : 1;

  process.exit(exitCode);
} catch (error) {
  // A run that cannot finish, such as an unreadable config or a failed git or shellcheck, exits 2,
  // so a caller never reads it as a run with findings.
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`zgeoff-check: ${message}\n`);
  process.exit(2);
}
