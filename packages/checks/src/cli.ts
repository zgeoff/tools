#!/usr/bin/env bun
import { resolve } from 'node:path';
import { allChecks } from './all-checks.ts';
import { loadConfig } from './load-config.ts';
import { resolveCLIArgs } from './resolve-cli-args.ts';
import { runChecks } from './run-checks.ts';
import { runGitShowToplevel } from './run-git-show-toplevel.ts';

const USAGE = `usage: zgeoff-check [--] [file ...]

Runs every check over the files that git tracks, or over the files given.
Each finding prints as path:line: <check>: <message>, with the path from the repo root.
Exits 0 with no finding, 1 with any finding, and 2 when the run could not finish.
Checks: ${allChecks.map((check) => check.name).join(', ')}`;

const parsed = await resolveCLIArgs(process.argv.slice(2));

if (typeof parsed === 'string') {
  process.stderr.write(`zgeoff-check: ${parsed}\n${USAGE}\n`);
  process.exit(2);
}

if (parsed.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const files = parsed.files;

try {
  // A run from a subfolder reads the root config, lists the whole repo, and takes each file argument
  // relative to the folder it runs in.
  const root = runGitShowToplevel(process.cwd(), process.env);

  const config = loadConfig(
    root,
    allChecks.map((check) => check.name),
  );

  const findings = await runChecks({
    cwd: root,
    checks: allChecks,
    config,
    env: process.env,
    ...(files.length === 0 ? {} : { files: files.map((file) => resolve(file)) }),
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
