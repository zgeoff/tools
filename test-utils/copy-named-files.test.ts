import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyNamedFiles } from './copy-named-files.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'copy-named-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { from: join(directory, 'from'), to: join(directory, 'to/scripts') };
}

test('it copies only the named files into a folder it creates', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.from, { 'kettle.sh': 'echo boil\n', 'lid.sh': 'echo shut\n' });
  await copyNamedFiles(ctx.from, ctx.to, ['kettle.sh']);

  const names = await readdir(ctx.to);
  const text = await readFile(join(ctx.to, 'kettle.sh'), 'utf8');

  expect({ names, text }).toStrictEqual({ names: ['kettle.sh'], text: 'echo boil\n' });
});
