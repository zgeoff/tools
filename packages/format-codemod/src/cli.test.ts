import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('cli.ts', import.meta.url));

/**
 * Runs the CLI from source under bun; the exit-code contract asserted here is
 * what the root format pipeline and the pre-commit hook consume.
 */
function runCLI(args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('it exits cleanly in check mode when files are already padded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'clean.ts');

  fs.writeFileSync(file, 'const a = 1;\n\nexport function f() {\n  return a;\n}\n');

  const status = runCLI(['--check', file]).status;

  expect(status).toBe(0);
});

test('it exits with the diff code in check mode when a file needs padding and leaves it unmodified', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'unpadded.ts');
  const src = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.writeFileSync(file, src);

  const result = runCLI(['--check', file]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(1);
  expect(stderr).toInclude('DIFF');
  expect(fs.readFileSync(file, 'utf8')).toBe(src);
});

test('it fails the batch in check mode when a file cannot be parsed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'broken.ts');

  fs.writeFileSync(file, 'const = (((\n');

  const result = runCLI(['--check', file]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude('PARSE-ERR');
});

test('it fails the batch when a named file does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const missing = path.join(dir, 'missing.ts');
  const result = runCLI(['--check', missing]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude('ERROR');
});

test('it still checks the remaining files after one fails to parse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const broken = path.join(dir, 'a-broken.ts');
  const unpadded = path.join(dir, 'b-unpadded.ts');

  fs.writeFileSync(broken, 'const = (((\n');
  fs.writeFileSync(unpadded, 'export function f() {\n  const a = 1;\n  return a;\n}\n');

  const result = runCLI(['--check', broken, unpadded]);

  expect(result.status).toBe(2);
  expect(result.stderr).toInclude('PARSE-ERR');
  expect(result.stderr).toInclude('DIFF');
});

test('it rejects an unknown flag with a usage error and leaves files untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'unpadded.ts');
  const src = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.writeFileSync(file, src);

  const result = runCLI(['--chekc', file]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(2);
  expect(stderr).toInclude("'--chekc'");
  expect(fs.readFileSync(file, 'utf8')).toBe(src);
});

test('it formats .tsx files containing JSX', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'component.tsx');

  fs.writeFileSync(file, 'const el = <div>hi</div>;\nexport function C() {\n  return el;\n}\n');

  const result = runCLI(['--check', file]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(1);
  expect(stderr).toInclude('DIFF');
});

test('it processes a file only once when patterns overlap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'unpadded.ts');

  fs.writeFileSync(file, 'export function f() {\n  const a = 1;\n  return a;\n}\n');

  const stderr = runCLI(['--check', dir, file]).stderr;

  expect(stderr.match(/DIFF/gu)).toHaveLength(1);
});

test('it prints the package version for --version', () => {
  const result = runCLI(['--version']);
  const status = result.status;
  const stdout = result.stdout;

  expect(status).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('it only reports files that would change in quiet mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));

  fs.writeFileSync(path.join(dir, 'clean.ts'), 'const a = 1;\n\nuse(a);\n');
  fs.writeFileSync(path.join(dir, 'unpadded.ts'), 'const a = 1;\nuse(a);\n');

  const stderr = runCLI(['--check', '--quiet', dir]).stderr;

  expect(stderr).toInclude('DIFF');
  expect(stderr).not.toInclude('OK ');
});

test('it does not descend into node_modules when expanding a directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const nested = path.join(dir, 'node_modules', 'dep');

  fs.mkdirSync(nested, { recursive: true });

  fs.writeFileSync(
    path.join(nested, 'unpadded.ts'),
    'export function f() {\n  const a = 1;\n  return a;\n}\n',
  );

  fs.writeFileSync(
    path.join(dir, 'clean.ts'),
    'const a = 1;\n\nexport function f() {\n  return a;\n}\n',
  );

  const result = runCLI(['--check', dir]);
  const status = result.status;
  const stderr = result.stderr;

  expect(status).toBe(0);
  expect(stderr).not.toInclude('node_modules');
});

test('it skips files matching --ignore globs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const generated = path.join(dir, 'generated');
  const unpadded = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.mkdirSync(generated);
  fs.writeFileSync(path.join(generated, 'out.ts'), unpadded);

  fs.writeFileSync(
    path.join(dir, 'clean.ts'),
    'const a = 1;\n\nexport function f() {\n  return a;\n}\n',
  );

  const result = runCLI(['--check', '--ignore', path.join(dir, 'generated/**'), dir]);

  expect(result.status).toBe(0);
  expect(result.stderr).not.toInclude('generated');
  expect(fs.readFileSync(path.join(generated, 'out.ts'), 'utf8')).toBe(unpadded);
});
