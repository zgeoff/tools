import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
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

test("it resolves @zgeoff/rig from the tree's root to the workspace's rig package", async () => {
  const directory = await createLintTree({}, {});
  const resolved = await realpath(Bun.resolveSync('@zgeoff/rig', directory));
  const rigIndex = await realpath(join(import.meta.dir, '..', '..', 'rig', 'src', 'index.ts'));

  expect(resolved).toBe(rigIndex);
});

test('it keeps node_modules out of the tree, so a lint of the tree skips it', async () => {
  const directory = await createLintTree({}, {});

  expect(existsSync(join(directory, 'node_modules'))).toBeFalse();
});

test('it removes the tree when the test finishes', async () => {
  const directory = await createLintTree({ 'kettle.ts': '' }, {});

  onTestFinished(() => {
    expect(existsSync(directory)).toBeFalse();
  });
});
