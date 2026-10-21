import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLintTree } from './create-lint-tree.ts';

test('it writes a config that loads the plugin with the given rules', async () => {
  const directory = await createLintTree({}, { 'zgeoff/no-jsdoc': 'error' });
  const text = await readFile(join(directory, '.oxlintrc.json'), 'utf8');

  expect(JSON.parse(text)).toStrictEqual({
    jsPlugins: [join(import.meta.dir, '..', 'plugin.js')],
    rules: { 'zgeoff/no-jsdoc': 'error' },
  });
});

test('it writes each file at its path, with the folders it needs', async () => {
  const directory = await createLintTree(
    { 'kettle.ts': 'export const cups = 2;\n', 'src/pot/lid.ts': 'export const lid = 1;\n' },
    {},
  );

  const kettle = await readFile(join(directory, 'kettle.ts'), 'utf8');
  const lid = await readFile(join(directory, 'src/pot/lid.ts'), 'utf8');

  expect(kettle).toBe('export const cups = 2;\n');
  expect(lid).toBe('export const lid = 1;\n');
});

test('it removes the tree when the test finishes', async () => {
  const directory = await createLintTree({ 'kettle.ts': '' }, {});

  onTestFinished(() => {
    expect(existsSync(directory)).toBeFalse();
  });
});
