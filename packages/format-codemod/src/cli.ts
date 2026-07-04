#!/usr/bin/env node
import fs from 'node:fs';
import { expandInputs } from './expand-inputs.ts';
import { transform } from './transform.ts';
import type { TransformResult } from './types.ts';
import { unifiedDiff } from './unified-diff.ts';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const inputs = argv.filter((a) => !a.startsWith('--'));

if (flags.has('--help') || (inputs.length === 0 && !flags.has('--version'))) {
  process.stdout.write(`format-codemod — enforce blank-line padding conventions via text splice

usage:
  format-codemod [options] <file|dir|glob> ...

options:
  --check     exit 1 if any file would change (no writes)
  --dry       print unified diff to stdout (no writes)
  --bench     print parse stats as JSON to stderr
  --quiet     only print files that would change
  --version
  --help

exit codes:
  0  clean
  1  files would change (--check)
  2  usage error, or one or more files failed (parse error, unreadable, unwritable)

examples:
  format-codemod 'src/**/*.ts'
  format-codemod --check 'src/**/*.{ts,tsx}'
  format-codemod --dry path/to/file.ts
`);
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

if (flags.has('--version')) {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const parsed: unknown = JSON.parse(fs.readFileSync(pkgUrl, 'utf8'));

  if (!isPackageJson(parsed)) {
    throw new TypeError('Invalid package.json');
  }

  process.stdout.write(`${parsed.version}\n`);
  process.exit(0);
}

const bench = { t0: Date.now(), bytes: 0, parsed: 0 };
const quiet = flags.has('--quiet');

type FileOutcome = 'ok' | 'changed' | 'failed' | 'skipped';

// Reached only when the file needs edits: report, preview, or write per mode.
function handleDiff(file: string, src: string, result: TransformResult): FileOutcome {
  if (flags.has('--check')) {
    console.error(`DIFF  ${file}  ${result.edits} edit(s)`);
  } else if (flags.has('--dry')) {
    process.stdout.write(unifiedDiff(src, result.output, file));
  } else {
    fs.writeFileSync(file, result.output);
    console.error(`WROTE ${file}  ${result.edits} edit(s)`);
  }

  return 'changed';
}

function checkFile(file: string): FileOutcome {
  const src = fs.readFileSync(file, 'utf8');

  bench.bytes += src.length;
  const result = transform(src);

  if (result.parseError !== null) {
    console.error(`PARSE-ERR ${file}  ${result.parseError}`);

    return 'failed';
  }
  bench.parsed++;

  if (result.edits === 0 || result.output === src) {
    return 'ok';
  }

  return handleDiff(file, src, result);
}

// A failed file must fail the batch: --check would otherwise exit 0 having
// validated nothing, and a throw would kill the process mid-batch with the
// remaining files silently skipped.
function processFile(file: string): FileOutcome {
  if (file.endsWith('.d.ts')) {
    return 'skipped';
  }

  try {
    return checkFile(file);
  } catch (error) {
    console.error(`ERROR ${file}  ${error instanceof Error ? error.message : String(error)}`);

    return 'failed';
  }
}

const files = await expandInputs(inputs);

if (files.length === 0) {
  console.error('no files matched');
  process.exit(2);
}

let anyChange = false;
let failures = 0;

for (const file of files) {
  const outcome = processFile(file);

  if (outcome === 'failed') {
    failures++;
  } else if (outcome === 'changed') {
    anyChange = true;
  } else if (!quiet) {
    console.error(outcome === 'skipped' ? `SKIP  ${file}  declaration file` : `OK    ${file}`);
  }
}

if (flags.has('--bench')) {
  const ms = Date.now() - bench.t0;

  console.error(
    JSON.stringify({
      files: files.length,
      parsed: bench.parsed,
      bytes: bench.bytes,
      ms,
      us_per_file: Math.round((ms * 1000) / files.length),
      mb_per_sec: Math.round((bench.bytes / 1024 / 1024 / (ms / 1000)) * 10) / 10,
    }),
  );
}

if (failures > 0) {
  process.exit(2);
}

if (flags.has('--check')) {
  process.exit(anyChange ? 1 : 0);
}
