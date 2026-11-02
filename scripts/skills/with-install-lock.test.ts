import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { flockLockFile } from './flock-lock-file.ts';
import type { InstallLockOptions } from './with-install-lock.ts';
import { withInstallLock } from './with-install-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-with-install-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const lockPath = join(directory, 'install.lock');

  const buildOptions = (overrides: Partial<InstallLockOptions> = {}): InstallLockOptions => ({
    lockPath,
    lockFile: flockLockFile,
    wait: () =>
      new Promise((resolve) => {
        setImmediate(resolve);
      }),
    attempts: 100_000,
    ...overrides,
  });

  // Takes the lock through a descriptor of its own, as another process would, and closes it.
  const probeFreeLock = async () => {
    const descriptor = await flockLockFile.createDescriptor(lockPath);

    const isFree = flockLockFile.createLock(descriptor);

    await flockLockFile.removeDescriptor(descriptor);

    return isFree;
  };

  return { lockPath, buildOptions, probeFreeLock };
}

test('it runs the work under the lock and ends the lock after', async () => {
  const ctx = await setupTest();
  const isFreeDuringWork = await withInstallLock(ctx.buildOptions(), () => ctx.probeFreeLock());
  const isFreeAfter = await ctx.probeFreeLock();

  expect(isFreeDuringWork).toBeFalse();
  expect(isFreeAfter).toBeTrue();
});

test('it ends the lock when the work fails', async () => {
  const ctx = await setupTest();

  const run = withInstallLock(ctx.buildOptions(), () =>
    Promise.reject(new Error('kettle boiled dry')),
  );

  expect(run).rejects.toThrow('kettle boiled dry');

  const isFree = await ctx.probeFreeLock();

  expect(isFree).toBeTrue();
});

test('it starts the work of a second run only after the first run ends', async () => {
  const ctx = await setupTest();

  const events: string[] = [];
  const firstStarted = Promise.withResolvers<void>();
  const secondWaited = Promise.withResolvers<void>();

  // The first run holds the lock until the second has had to wait for it.
  const first = withInstallLock(ctx.buildOptions(), async () => {
    events.push('first starts');
    firstStarted.resolve();

    await secondWaited.promise;

    events.push('first ends');
  });

  await firstStarted.promise;

  const wait = () => {
    secondWaited.resolve();

    return new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  };

  const second = withInstallLock(ctx.buildOptions({ wait }), () => {
    events.push('second starts');

    return Promise.resolve();
  });

  await Promise.all([first, second]);

  expect(events).toStrictEqual(['first starts', 'first ends', 'second starts']);
});

test('it fails after every try while another run holds the lock', async () => {
  const ctx = await setupTest();
  const holding = await flockLockFile.createDescriptor(ctx.lockPath);

  onTestFinished(() => flockLockFile.removeDescriptor(holding));

  flockLockFile.createLock(holding);

  const run = withInstallLock(ctx.buildOptions({ attempts: 3 }), () => Promise.resolve());

  expect(run).rejects.toThrow(`${ctx.lockPath} is held by another install; try again once it ends`);
});
