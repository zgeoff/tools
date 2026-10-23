import { expect, onTestFinished, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyDiffMode } from './apply-diff-mode.ts';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'handle-diff-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it reports the edit count without writing in check mode', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'a.ts');
  const source = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, source);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, source, result }, 'check');

  expect(out).toStrictEqual({ message: `DIFF  ${file}  1 edit(s)`, stdout: null });
  expect(fs.readFileSync(file, 'utf8')).toBe(source);
});

test('it returns a unified diff for stdout without writing in dry mode', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'a.ts');
  const source = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, source);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, source, result }, 'dry');

  expect(out.message).toBeNil();
  expect(out.stdout).toStartWith(`--- ${file}\n+++ ${file}\n@@`);
  expect(fs.readFileSync(file, 'utf8')).toBe(source);
});

test('it writes the transformed output to disk in write mode', () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'a.ts');
  const source = 'const a = 1;\nuse(a);\n';

  fs.writeFileSync(file, source);

  const result = { output: 'const a = 1;\n\nuse(a);\n', edits: 1, parseError: null };
  const out = applyDiffMode({ file, source, result }, 'write');

  expect(out.message).toInclude('WROTE');
  expect(fs.readFileSync(file, 'utf8')).toBe('const a = 1;\n\nuse(a);\n');
});
