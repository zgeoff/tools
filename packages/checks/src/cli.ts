#!/usr/bin/env bun
import { allChecks } from './all-checks.ts';
import { ConfigError } from './config-error.ts';
import { loadConfig } from './load-config.ts';
import { MissingProgramError } from './missing-program-error.ts';
import { runChecks } from './run-checks.ts';

// Exit codes: 0 with no finding, 1 with any finding, 2 when the run itself fails.
const USAGE = `usage: zgeoff-check [--] [file ...]

Runs every check over the files that git tracks, or over the files given.
Each finding prints as path:line: <check>: <message>.
Checks: ${allChecks.map((check) => check.name).join(', ')}`;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const separator = args.indexOf('--');
const options = separator === -1 ? args : args.slice(0, separator);
const files = separator === -1 ? args : [...args.slice(0, separator), ...args.slice(separator + 1)];
const unknownOption = options.find((arg) => arg.startsWith('-'));

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
  if (!(error instanceof ConfigError || error instanceof MissingProgramError)) {
    throw error;
  }

  process.stderr.write(`zgeoff-check: ${error.message}\n`);
  process.exit(2);
}
