import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyDiffMode } from '../src/cli/apply-diff-mode.ts';

test('it reports the edit count without writing in check mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handle-diff-'));
  const file = path.join(dir, 'a.ts');
  const src = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, src);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, src, result }, 'check');

  expect(out).toEqual({ message: `DIFF  ${file}  1 edit(s)`, stdout: null });
  expect(fs.readFileSync(file, 'utf8')).toBe(src);
});

test('it returns a unified diff for stdout without writing in dry mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handle-diff-'));
  const file = path.join(dir, 'a.ts');
  const src = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, src);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, src, result }, 'dry');

  expect(out.message).toBeNil();
  expect(out.stdout).toStartWith(`--- ${file}\n+++ ${file}\n@@`);
  expect(fs.readFileSync(file, 'utf8')).toBe(src);
});

test('it writes the transformed output to disk in write mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handle-diff-'));
  const file = path.join(dir, 'a.ts');
  const src = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, src);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, src, result }, 'write');

  expect(out.message).toInclude('WROTE');
  expect(fs.readFileSync(file, 'utf8')).toBe('const a = 1;\n\nuse(a);\n');
});
