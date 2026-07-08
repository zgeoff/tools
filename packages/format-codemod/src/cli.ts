#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { buildBenchStatsFromReports } from './cli/build-bench-stats-from-reports.ts';
import { expandInputs } from './cli/expand-inputs.ts';
import { loadFormatIgnore } from './cli/load-format-ignore.ts';
import { parseCLIArgs } from './cli/parse-cli-args.ts';
import { printHelp } from './cli/print-help.ts';
import { printReport } from './cli/print-report.ts';
import { readPackageVersion } from './cli/read-package-version.ts';
import { tryCheckFile } from './cli/try-check-file.ts';
import type { FileReport } from './cli/types.ts';

const parsedArgs = parseCLIArgs(process.argv.slice(2));

if (typeof parsedArgs === 'string') {
  console.error(parsedArgs);
  process.exit(2);
}

const mode = parsedArgs.mode;
const quiet = parsedArgs.quiet;
const bench = parsedArgs.bench;
const inputs = parsedArgs.inputs;

if (parsedArgs.help || (inputs.length === 0 && !parsedArgs.version)) {
  const exitCode = inputs.length === 0 ? 2 : 0;

  printHelp();
  process.exit(exitCode);
}

// The manifest URL resolves here, not in the helper: only this file sits at
// the same depth in src/ and dist/, so '../package.json' is correct in both.
if (parsedArgs.version) {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));

  process.stdout.write(`${readPackageVersion(pkgPath)}\n`);
  process.exit(0);
}

const t0 = Date.now();

const ignore = [...loadFormatIgnore(process.cwd()), ...parsedArgs.ignore];

const files = await expandInputs(inputs, ignore);

if (files.length === 0) {
  console.error('no files matched');
  process.exit(2);
}

const reports: FileReport[] = [];

for (const file of files) {
  const report = tryCheckFile(file, mode);

  reports.push(report);
  printReport(file, report, quiet);
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
  const exitCode = anyChange ? 1 : 0;

  process.exit(exitCode);
}
