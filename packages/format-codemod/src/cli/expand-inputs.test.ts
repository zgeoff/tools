import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandInputs } from './expand-inputs.ts';

test('it expands a directory to the ts and tsx files beneath it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(directory, 'nested'));
  fs.writeFileSync(path.join(directory, 'a.ts'), '');
  fs.writeFileSync(path.join(directory, 'nested', 'b.tsx'), '');
  fs.writeFileSync(path.join(directory, 'c.js'), '');

  const files = await expandInputs([directory]);

  expect(files.map((file) => path.basename(file))).toIncludeSameMembers(['a.ts', 'b.tsx']);
});

test('it never descends into node_modules or .git', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(directory, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(directory, '.git'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'node_modules', 'dep', 'a.ts'), '');
  fs.writeFileSync(path.join(directory, '.git', 'b.ts'), '');
  fs.writeFileSync(path.join(directory, 'keep.ts'), '');

  const files = await expandInputs([directory]);

  expect(files.map((file) => path.basename(file))).toEqual(['keep.ts']);
});

test('it treats an existing bracketed path as a literal file, not a glob', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const bracketed = path.join(directory, '[slug]');

  fs.mkdirSync(bracketed);
  fs.writeFileSync(path.join(bracketed, 'page.tsx'), '');

  const files = await expandInputs([path.join(bracketed, 'page.tsx')]);

  expect(files).toEqual([path.join(bracketed, 'page.tsx')]);
});

test('it expands glob patterns for paths that do not exist literally', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.writeFileSync(path.join(directory, 'a.ts'), '');
  fs.writeFileSync(path.join(directory, 'b.ts'), '');

  const files = await expandInputs([path.join(directory, '*.ts')]);

  expect(files).toHaveLength(2);
});

test('it dedupes files matched by overlapping patterns', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const file = path.join(directory, 'a.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([directory, file]);

  expect(files).toHaveLength(1);
});

test('it passes a missing literal path through so the CLI can report it', async () => {
  const missing = path.join(os.tmpdir(), 'expand-inputs-none', 'missing.ts');

  const files = await expandInputs([missing]);

  expect(files).toEqual([missing]);
});

test('it skips files matching an ignore glob during directory expansion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  fs.mkdirSync(path.join(directory, 'generated'));
  fs.writeFileSync(path.join(directory, 'keep.ts'), '');
  fs.writeFileSync(path.join(directory, 'generated', 'out.ts'), '');

  const files = await expandInputs([directory], [path.join(directory, 'generated/**')]);

  expect(files.map((file) => path.basename(file))).toEqual(['keep.ts']);
});

test('it applies ignore globs to explicit file arguments', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));
  const file = path.join(directory, 'a.gen.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([file], ['**/*.gen.ts']);

  expect(files).toBeEmpty();
});
