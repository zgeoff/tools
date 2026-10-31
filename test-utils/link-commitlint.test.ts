import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linkCommitlint } from './link-commitlint.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'link-commitlint-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root, toolsRoot: join(import.meta.dir, '..') };
}

test('it links the commitlint CLI and its config from the tools checkout', async () => {
  const ctx = await setupTest();

  await linkCommitlint(ctx.root, ctx.toolsRoot);

  const links = await Promise.all(
    [
      'node_modules/.bin/commitlint',
      'node_modules/@zgeoff/commitlint-config',
      'node_modules/@commitlint/cli',
    ].map((path) => readlink(join(ctx.root, path))),
  );

  expect(links).toStrictEqual([
    join(ctx.toolsRoot, 'node_modules/.bin/commitlint'),
    join(ctx.toolsRoot, 'node_modules/@zgeoff/commitlint-config'),
    join(ctx.toolsRoot, 'node_modules/@commitlint/cli'),
  ]);
});
