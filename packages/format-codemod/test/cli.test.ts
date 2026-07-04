import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the CLI from source under bun; the exit-code contract asserted here is
// what the root format pipeline and the pre-commit hook consume.
const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

function runCli(args: readonly string[]): {
  status: number | null;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
  });

  return { status: result.status, stderr: result.stderr };
}

test('it exits cleanly in check mode when files are already padded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'clean.ts');

  fs.writeFileSync(file, 'const a = 1;\n\nexport function f() {\n  return a;\n}\n');
  const { status } = runCli(['--check', file]);

  expect(status).toBe(0);
});

test('it exits with the diff code in check mode when a file needs padding and leaves it unmodified', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'unpadded.ts');
  const src = 'export function f() {\n  const a = 1;\n  return a;\n}\n';

  fs.writeFileSync(file, src);
  const { status, stderr } = runCli(['--check', file]);

  expect(status).toBe(1);
  expect(stderr).toInclude('DIFF');
  expect(fs.readFileSync(file, 'utf8')).toBe(src);
});

test('it fails the batch in check mode when a file cannot be parsed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const file = path.join(dir, 'broken.ts');

  fs.writeFileSync(file, 'const = (((\n');
  const { status, stderr } = runCli(['--check', file]);

  expect(status).toBe(2);
  expect(stderr).toInclude('PARSE-ERR');
});

test('it fails the batch when a named file does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const missing = path.join(dir, 'missing.ts');
  const { status, stderr } = runCli(['--check', missing]);

  expect(status).toBe(2);
  expect(stderr).toInclude('ERROR');
});

test('it still checks the remaining files after one fails to parse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-codemod-'));
  const broken = path.join(dir, 'a-broken.ts');
  const unpadded = path.join(dir, 'b-unpadded.ts');

  fs.writeFileSync(broken, 'const = (((\n');
  fs.writeFileSync(unpadded, 'export function f() {\n  const a = 1;\n  return a;\n}\n');
  const { status, stderr } = runCli(['--check', broken, unpadded]);

  expect(status).toBe(2);
  expect(stderr).toInclude('PARSE-ERR');
  expect(stderr).toInclude('DIFF');
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
  const { status, stderr } = runCli(['--check', dir]);

  expect(status).toBe(0);
  expect(stderr).not.toInclude('node_modules');
});
