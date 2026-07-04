#!/usr/bin/env node
import fs from 'node:fs';
import { buildBenchStatsFromReports } from './cli/build-bench-stats-from-reports.ts';
import { printHelp } from './cli/print-help.ts';
import { processFile } from './cli/process-file.ts';
import { expandInputs } from './expand-inputs.ts';
import type { CliMode, FileReport } from './types.ts';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const inputs = argv.filter((a) => !a.startsWith('--'));

if (flags.has('--help') || (inputs.length === 0 && !flags.has('--version'))) {
  printHelp();
  process.exit(inputs.length === 0 ? 2 : 0);
}

function isPackageJson(value: unknown): value is { version: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

// Stays in the entry module: it resolves package.json relative to
// import.meta.url, and only this file sits at the same depth in src/ and dist/.
if (flags.has('--version')) {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const parsed: unknown = JSON.parse(fs.readFileSync(pkgUrl, 'utf8'));

  if (!isPackageJson(parsed)) {
    throw new TypeError('Invalid package.json');
  }

  process.stdout.write(`${parsed.version}\n`);
  process.exit(0);
}

const t0 = Date.now();
let mode: CliMode = 'write';

if (flags.has('--check')) {
  mode = 'check';
} else if (flags.has('--dry')) {
  mode = 'dry';
}
const quiet = flags.has('--quiet');
const files = await expandInputs(inputs);

if (files.length === 0) {
  console.error('no files matched');
  process.exit(2);
}

const reports: FileReport[] = [];

for (const file of files) {
  const report = processFile(file, mode);

  reports.push(report);

  if (!quiet && report.outcome === 'ok') {
    console.error(`OK    ${file}`);
  } else if (!quiet && report.outcome === 'skipped') {
    console.error(`SKIP  ${file}  declaration file`);
  }
}

const failures = reports.filter((r) => r.outcome === 'failed').length;
const anyChange = reports.some((r) => r.outcome === 'changed');

if (flags.has('--bench')) {
  const stats = buildBenchStatsFromReports(reports, Date.now() - t0);

  console.error(JSON.stringify(stats));
}

if (failures > 0) {
  process.exit(2);
}

if (flags.has('--check')) {
  process.exit(anyChange ? 1 : 0);
}
