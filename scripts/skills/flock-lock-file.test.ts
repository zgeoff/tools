import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { flockLockFile } from './flock-lock-file.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-flock-lock-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const lockPath = join(directory, 'install.lock');

  const createDescriptor = async () => {
    const descriptor = await flockLockFile.createDescriptor(lockPath);

    onTestFinished(() => flockLockFile.removeDescriptor(descriptor));

    return descriptor;
  };

  return { lockPath, createDescriptor };
}

test('it refuses a second descriptor the lock until the first one closes', async () => {
  const ctx = await setupTest();
  const first = await flockLockFile.createDescriptor(ctx.lockPath);

  let isFirstOpen = true;

  // A failed check before the close leaves the first descriptor open, so the cleanup closes it.
  onTestFinished(async () => {
    if (isFirstOpen) {
      await flockLockFile.removeDescriptor(first);
    }
  });

  const second = await ctx.createDescriptor();

  const isFirstHeld = flockLockFile.createLock(first);
  const isSecondHeldWhileFirstOpen = flockLockFile.createLock(second);

  await flockLockFile.removeDescriptor(first);

  isFirstOpen = false;

  const isSecondHeldAfter = flockLockFile.createLock(second);

  expect([isFirstHeld, isSecondHeldWhileFirstOpen, isSecondHeldAfter]).toStrictEqual([
    true,
    false,
    true,
  ]);
});

test('it frees the lock when the process that holds it is killed', async () => {
  const ctx = await setupTest();

  const module = join(import.meta.dir, 'flock-lock-file.ts');

  // The child takes the lock, says so, and keeps running until it is killed.
  const holder = Bun.spawn(
    [
      'bun',
      '-e',
      `const { flockLockFile } = await import(${JSON.stringify(module)}); const descriptor = await flockLockFile.createDescriptor(${JSON.stringify(ctx.lockPath)}); console.log(flockLockFile.createLock(descriptor)); setInterval(() => {}, 1000);`,
    ],
    { stdout: 'pipe', detached: true },
  );

  let isHolderRunning = true;

  // The child leads its own process group, so the cleanup stops every process it started.
  onTestFinished(() => {
    if (isHolderRunning) {
      process.kill(-holder.pid, 'SIGKILL');
    }
  });

  const reader = holder.stdout.getReader();

  const said = await reader.read();
  const descriptor = await ctx.createDescriptor();

  const isHeldWhileChildRuns = flockLockFile.createLock(descriptor);

  process.kill(-holder.pid, 'SIGKILL');

  await holder.exited;

  isHolderRunning = false;

  const isHeldAfterKill = flockLockFile.createLock(descriptor);

  expect(new TextDecoder().decode(said.value).trim()).toBe('true');
  expect(isHeldWhileChildRuns).toBeFalse();
  expect(isHeldAfterKill).toBeTrue();
});
