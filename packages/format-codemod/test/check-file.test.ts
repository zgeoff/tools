import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkFile } from '../src/cli/check-file.ts';

test('it reports ok with nothing to print for a compliant file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'clean.ts');

  fs.writeFileSync(file, 'const a = 1;\n\nuse(a);\n');

  expect(checkFile(file, 'check')).toEqual({
    outcome: 'ok',
    bytes: 22,
    parsed: true,
    message: null,
    stdout: null,
  });
});

test('it rewrites the file and reports the write in write mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'unpadded.ts');

  fs.writeFileSync(file, 'const a = 1;\nuse(a);\n');
  const report = checkFile(file, 'write');

  expect(report).toMatchObject({ outcome: 'changed', message: expect.toInclude('WROTE') });
  expect(fs.readFileSync(file, 'utf8')).toBe('const a = 1;\n\nuse(a);\n');
});

test('it reports the diff without touching the file in check mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'unpadded.ts');

  fs.writeFileSync(file, 'const a = 1;\nuse(a);\n');
  const report = checkFile(file, 'check');

  expect(report).toMatchObject({ outcome: 'changed', message: expect.toInclude('DIFF') });
  expect(fs.readFileSync(file, 'utf8')).toBe('const a = 1;\nuse(a);\n');
});

test('it returns the unified diff as stdout payload in dry mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'unpadded.ts');

  fs.writeFileSync(file, 'const a = 1;\nuse(a);\n');
  const report = checkFile(file, 'dry');

  expect(report.stdout).toInclude('@@ -1,2 +1,3 @@');
  expect(fs.readFileSync(file, 'utf8')).toBe('const a = 1;\nuse(a);\n');
});

test('it reports failed with a parse-error message for a broken file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'broken.ts');

  fs.writeFileSync(file, 'const = (((\n');

  expect(checkFile(file, 'check')).toMatchObject({
    outcome: 'failed',
    parsed: false,
    message: expect.toInclude('PARSE-ERR'),
  });
});

test('it measures bytes, not UTF-16 code units', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-file-'));
  const file = path.join(dir, 'unicode.ts');

  fs.writeFileSync(file, "const emoji = '🎉';\n");

  expect(checkFile(file, 'check').bytes).toBe(Buffer.byteLength("const emoji = '🎉';\n"));
});
