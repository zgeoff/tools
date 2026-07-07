import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandInputs } from './expand-inputs.ts';

test('it expands a directory to the ts and tsx files beneath it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(dir, 'nested'));
  fs.writeFileSync(path.join(dir, 'a.ts'), '');
  fs.writeFileSync(path.join(dir, 'nested', 'b.tsx'), '');
  fs.writeFileSync(path.join(dir, 'c.js'), '');

  const files = await expandInputs([dir]);

  expect(files.map((f) => path.basename(f))).toIncludeSameMembers(['a.ts', 'b.tsx']);
});

test('it never descends into node_modules or .git', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'a.ts'), '');
  fs.writeFileSync(path.join(dir, '.git', 'b.ts'), '');
  fs.writeFileSync(path.join(dir, 'keep.ts'), '');

  const files = await expandInputs([dir]);

  expect(files.map((f) => path.basename(f))).toEqual(['keep.ts']);
});

test('it treats an existing bracketed path as a literal file, not a glob', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const bracketed = path.join(dir, '[slug]');

  fs.mkdirSync(bracketed);
  fs.writeFileSync(path.join(bracketed, 'page.tsx'), '');

  const files = await expandInputs([path.join(bracketed, 'page.tsx')]);

  expect(files).toEqual([path.join(bracketed, 'page.tsx')]);
});

test('it expands glob patterns for paths that do not exist literally', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.writeFileSync(path.join(dir, 'a.ts'), '');
  fs.writeFileSync(path.join(dir, 'b.ts'), '');

  const files = await expandInputs([path.join(dir, '*.ts')]);

  expect(files).toHaveLength(2);
});

test('it dedupes files matched by overlapping patterns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const file = path.join(dir, 'a.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([dir, file]);

  expect(files).toHaveLength(1);
});

test('it passes a missing literal path through so the CLI can report it', async () => {
  const missing = path.join(os.tmpdir(), 'expand-inputs-none', 'missing.ts');

  const files = await expandInputs([missing]);

  expect(files).toEqual([missing]);
});

test('it skips files matching an ignore glob during directory expansion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(dir, 'generated'));
  fs.writeFileSync(path.join(dir, 'keep.ts'), '');
  fs.writeFileSync(path.join(dir, 'generated', 'out.ts'), '');

  const files = await expandInputs([dir], [path.join(dir, 'generated/**')]);

  expect(files.map((f) => path.basename(f))).toEqual(['keep.ts']);
});

test('it applies ignore globs to explicit file arguments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const file = path.join(dir, 'a.gen.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([file], ['**/*.gen.ts']);

  expect(files).toBeEmpty();
});
