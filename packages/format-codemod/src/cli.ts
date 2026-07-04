#!/usr/bin/env node
import fs from 'node:fs';
import { buildBenchStatsFromReports } from './cli/build-bench-stats-from-reports.ts';
import { expandInputs } from './cli/expand-inputs.ts';
import { parseCLIArgs } from './cli/parse-cli-args.ts';
import { printHelp } from './cli/print-help.ts';
import { tryCheckFile } from './cli/try-check-file.ts';
import type { FileReport } from './cli/types.ts';

const parsedArgs = parseCLIArgs(process.argv.slice(2));

if (typeof parsedArgs === 'string') {
  console.error(parsedArgs);
  process.exit(2);
}

const { mode, quiet, bench, help, version, inputs } = parsedArgs;

if (help || (inputs.length === 0 && !version)) {
  printHelp();
  process.exit(inputs.length === 0 ? 2 : 0);
}

function isPackageJSON(value: unknown): value is { version: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

// Stays in the entry module: it resolves package.json relative to
// import.meta.url, and only this file sits at the same depth in src/ and dist/.
if (version) {
  const pkgURL = new URL('../package.json', import.meta.url);

  const parsed: unknown = JSON.parse(fs.readFileSync(pkgURL, 'utf8'));

  if (!isPackageJSON(parsed)) {
    throw new TypeError('Invalid package.json');
  }

  process.stdout.write(`${parsed.version}\n`);
  process.exit(0);
}

/**
 * All stream writes live here: modules below the entry return what to print.
 */
function printReport(file: string, report: FileReport): void {
  if (report.stdout !== null) {
    process.stdout.write(report.stdout);
  }

  if (report.message !== null) {
    console.error(report.message);
  }

  if (!quiet && report.outcome === 'ok') {
    console.error(`OK    ${file}`);
  }

  if (!quiet && report.outcome === 'skipped') {
    console.error(`SKIP  ${file}  declaration file`);
  }
}

const t0 = Date.now();
const files = await expandInputs(inputs);

if (files.length === 0) {
  console.error('no files matched');
  process.exit(2);
}

const reports: FileReport[] = [];

for (const file of files) {
  const report = tryCheckFile(file, mode);

  reports.push(report);
  printReport(file, report);
}

const failures = reports.filter((r) => r.outcome === 'failed').length;
const anyChange = reports.some((r) => r.outcome === 'changed');

if (bench) {
  const stats = buildBenchStatsFromReports(reports, Date.now() - t0);

  console.error(JSON.stringify(stats));
}

if (failures > 0) {
  process.exit(2);
}

if (mode === 'check') {
  process.exit(anyChange ? 1 : 0);
}
