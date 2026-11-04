import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { withFileLock } from '../with-file-lock.ts';
import { createLockHolder } from './create-lock-holder.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('lock-holder-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'build.lock') };
}

test('it holds the lock until it is released', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const whileHeld = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  await holder.release();

  const afterRelease = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(whileHeld.kind).toBe('busy');
  expect(afterRelease).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it holds the lock until it is killed', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  await holder.kill();

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it fails when another holder keeps the lock', async () => {
  const ctx = await setupTest();

  const result = await withFileLock(ctx.lockPath, () =>
    createLockHolder(ctx.lockPath).then(
      () => 'held',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    ),
  );

  expect(result).toStrictEqual({
    kind: 'ran',
    value: `the lock holder could not take the lock ${ctx.lockPath}: busy\n`,
  });
});
