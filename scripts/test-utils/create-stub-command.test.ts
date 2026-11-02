import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubCommand } from './create-stub-command.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-stub-command-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it records each call with its arguments, prints nothing and succeeds', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'calls');

  await createStubCommand(ctx.directory, 'npm', log);

  const first = await $`${join(ctx.directory, 'npm')} view kettle@1.0.0 version`.nothrow().quiet();
  const second = await $`${join(ctx.directory, 'npm')} publish ./kettle.tgz`.nothrow().quiet();

  expect(first.exitCode).toBe(0);
  expect(first.stdout.toString()).toBe('');
  expect(second.exitCode).toBe(0);
  expect(second.stdout.toString()).toBe('');

  const calls = await readFile(log, 'utf8');

  expect(calls).toBe('npm view kettle@1.0.0 version\nnpm publish ./kettle.tgz\n');
});

test('it prints the output it is given on each call', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'calls');

  await createStubCommand(ctx.directory, 'npm', log, '1.0.0\n');

  const first = await $`${join(ctx.directory, 'npm')} view kettle@1.0.0 version`.nothrow().quiet();
  const second = await $`${join(ctx.directory, 'npm')} view kettle@1.0.0 version`.nothrow().quiet();

  expect(first.exitCode).toBe(0);
  expect(first.stdout.toString()).toBe('1.0.0\n');
  expect(second.exitCode).toBe(0);
  expect(second.stdout.toString()).toBe('1.0.0\n');
});
