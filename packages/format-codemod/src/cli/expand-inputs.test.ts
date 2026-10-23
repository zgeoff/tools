import { expect, onTestFinished, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandInputs } from './expand-inputs.ts';

function setupTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-inputs-'));

  onTestFinished(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory };
}

test('it expands a directory to the ts and tsx files beneath it', async () => {
  const ctx = setupTest();

  fs.mkdirSync(path.join(ctx.directory, 'nested'));
  fs.writeFileSync(path.join(ctx.directory, 'a.ts'), '');
  fs.writeFileSync(path.join(ctx.directory, 'nested', 'b.tsx'), '');
  fs.writeFileSync(path.join(ctx.directory, 'c.js'), '');

  const files = await expandInputs([ctx.directory]);

  expect(files.map((file) => path.basename(file))).toIncludeSameMembers(['a.ts', 'b.tsx']);
});

test('it never descends into node_modules or .git', async () => {
  const ctx = setupTest();

  fs.mkdirSync(path.join(ctx.directory, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(ctx.directory, '.git'), { recursive: true });
  fs.writeFileSync(path.join(ctx.directory, 'node_modules', 'dep', 'a.ts'), '');
  fs.writeFileSync(path.join(ctx.directory, '.git', 'b.ts'), '');
  fs.writeFileSync(path.join(ctx.directory, 'keep.ts'), '');

  const files = await expandInputs([ctx.directory]);

  expect(files.map((file) => path.basename(file))).toStrictEqual(['keep.ts']);
});

test('it treats an existing bracketed path as a literal file, not a glob', async () => {
  const ctx = setupTest();
  const bracketed = path.join(ctx.directory, '[slug]');

  fs.mkdirSync(bracketed);
  fs.writeFileSync(path.join(bracketed, 'page.tsx'), '');

  const files = await expandInputs([path.join(bracketed, 'page.tsx')]);

  expect(files).toStrictEqual([path.join(bracketed, 'page.tsx')]);
});

test('it expands glob patterns for paths that do not exist literally', async () => {
  const ctx = setupTest();

  fs.writeFileSync(path.join(ctx.directory, 'a.ts'), '');
  fs.writeFileSync(path.join(ctx.directory, 'b.ts'), '');

  const files = await expandInputs([path.join(ctx.directory, '*.ts')]);

  expect(files).toHaveLength(2);
});

test('it dedupes files matched by overlapping patterns', async () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'a.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([ctx.directory, file]);

  expect(files).toHaveLength(1);
});

test('it passes a missing literal path through so the CLI can report it', async () => {
  const missing = path.join(os.tmpdir(), 'expand-inputs-none', 'missing.ts');

  const files = await expandInputs([missing]);

  expect(files).toStrictEqual([missing]);
});

test('it skips files matching an ignore glob during directory expansion', async () => {
  const ctx = setupTest();

  fs.mkdirSync(path.join(ctx.directory, 'generated'));
  fs.writeFileSync(path.join(ctx.directory, 'keep.ts'), '');
  fs.writeFileSync(path.join(ctx.directory, 'generated', 'out.ts'), '');

  const files = await expandInputs([ctx.directory], [path.join(ctx.directory, 'generated/**')]);

  expect(files.map((file) => path.basename(file))).toStrictEqual(['keep.ts']);
});

test('it applies ignore globs to explicit file arguments', async () => {
  const ctx = setupTest();
  const file = path.join(ctx.directory, 'a.gen.ts');

  fs.writeFileSync(file, '');

  const files = await expandInputs([file], ['**/*.gen.ts']);

  expect(files).toBeEmpty();
});
