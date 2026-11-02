import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubClock } from './create-stub-clock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'create-stub-clock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it prints the given times in order, one per call', async () => {
  const ctx = await setupTest();

  await createStubClock(ctx.directory, [10, 20]);

  const date = join(ctx.directory, 'date');

  const output = await $`${date} +%s && ${date} +%s`.text();

  expect(output).toBe('10\n20\n');
});

test('it repeats the last time once the times run out', async () => {
  const ctx = await setupTest();

  await createStubClock(ctx.directory, [10, 20]);

  const date = join(ctx.directory, 'date');

  const output = await $`${date} +%s && ${date} +%s && ${date} +%s`.text();

  expect(output).toBe('10\n20\n20\n');
});

test.each([
  ['no argument', []],
  ['another format', ['+%Y']],
  ['an extra argument', ['+%s', '-u']],
])('it exits 64 and prints no time for %s', async (_label, args) => {
  const ctx = await setupTest();

  await createStubClock(ctx.directory, [10]);

  const result = await $`${join(ctx.directory, 'date')} ${args}`.nothrow().quiet();

  expect(result.exitCode).toBe(64);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toBe('stub date: supports only: date +%s\n');
});

test('it leaves the next call its first time after a refused call', async () => {
  const ctx = await setupTest();

  await createStubClock(ctx.directory, [10, 20]);

  const date = join(ctx.directory, 'date');

  const output = await $`${date} +%Y; ${date} +%s`.nothrow().quiet();

  expect(output.stdout.toString()).toBe('10\n');
});
