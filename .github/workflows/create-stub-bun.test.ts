import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubBun } from './create-stub-bun.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'create-stub-bun-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it records the script name of each bun run call in order', async () => {
  const ctx = await setupTest();

  await createStubBun(ctx.dir, join(ctx.dir, 'ran'));

  await $`${join(ctx.dir, 'bun')} run lint && ${join(ctx.dir, 'bun')} run format:check`.quiet();

  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(ran).toBe('lint\nformat:check\n');
});

test.each([
  ['bun install', ['install']],
  ['bun run with a script argument', ['run', 'test', './a.test.ts']],
  ['bun with no arguments', []],
])('it exits 64 and records nothing for %s', async (_label, args) => {
  const ctx = await setupTest();

  await createStubBun(ctx.dir, join(ctx.dir, 'ran'));

  const result = await $`${join(ctx.dir, 'bun')} ${args}`.nothrow().quiet();
  const recorded = await Bun.file(join(ctx.dir, 'ran')).exists();

  expect(result.exitCode).toBe(64);
  expect(result.stderr.toString()).toBe('stub bun: supports only: bun run <script>\n');
  expect(recorded).toBeFalse();
});
