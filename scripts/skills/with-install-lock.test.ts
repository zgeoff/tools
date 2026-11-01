import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstallLockOptions } from './with-install-lock.ts';
import { withInstallLock } from './with-install-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-with-install-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const lockPath = join(directory, 'install.lock');

  const buildOptions = (overrides: Partial<InstallLockOptions> = {}): InstallLockOptions => ({
    lockPath,
    ownerID: '4242',
    probeOwner: () => true,
    wait: () =>
      new Promise((resolve) => {
        setImmediate(resolve);
      }),
    attempts: 100_000,
    ...overrides,
  });

  const readNames = () => readdir(directory);

  return { lockPath, buildOptions, readNames };
}

test('it runs the work under a lock that names its owner and removes the lock after', async () => {
  const ctx = await setupTest();
  const result = await withInstallLock(ctx.buildOptions(), () => readFile(ctx.lockPath, 'utf8'));
  const names = await ctx.readNames();

  expect(result).toBe('4242');
  expect(names).toStrictEqual([]);
});

test('it removes the lock when the work fails', async () => {
  const ctx = await setupTest();

  const run = withInstallLock(ctx.buildOptions(), () =>
    Promise.reject(new Error('kettle boiled dry')),
  );

  expect(run).rejects.toThrow('kettle boiled dry');

  const names = await ctx.readNames();

  expect(names).toStrictEqual([]);
});

test('it starts the work of a second owner only after the first owner ends', async () => {
  const ctx = await setupTest();

  const events: string[] = [];
  const firstStarted = Promise.withResolvers<void>();
  const secondWaited = Promise.withResolvers<void>();

  // The first owner holds the lock until the second has had to wait for it.
  const first = withInstallLock(ctx.buildOptions({ ownerID: '1001' }), async () => {
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

  const second = withInstallLock(ctx.buildOptions({ ownerID: '1002', wait }), () => {
    events.push('second starts');

    return Promise.resolve();
  });

  await Promise.all([first, second]);

  expect(events).toStrictEqual(['first starts', 'first ends', 'second starts']);
});

test('it takes over a lock whose owner no longer runs', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.lockPath, '3003');

  const options = ctx.buildOptions({ probeOwner: (ownerID) => ownerID !== '3003' });

  const result = await withInstallLock(options, () => readFile(ctx.lockPath, 'utf8'));
  const names = await ctx.readNames();

  expect(result).toBe('4242');
  expect(names).toStrictEqual([]);
});

test('it fails and keeps the lock when its owner still runs after every try', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.lockPath, '3003');

  const run = withInstallLock(ctx.buildOptions({ attempts: 3 }), () => Promise.resolve());

  expect(run).rejects.toThrow(
    `${ctx.lockPath} is held by another install; remove it if no install runs, then try again`,
  );

  const owner = await readFile(ctx.lockPath, 'utf8');
  const names = await ctx.readNames();

  expect(owner).toBe('3003');
  expect(names).toStrictEqual(['install.lock']);
});

test('it puts back a lock that another owner made after the dead owner', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.lockPath, '3003');

  // Another waiter takes over the dead lock between this waiter's read of it and its move aside.
  const probeOwner = (ownerID: string) => {
    if (ownerID === '3003') {
      writeFileSync(ctx.lockPath, '5005');
    }

    return ownerID !== '3003';
  };

  const run = withInstallLock(ctx.buildOptions({ probeOwner, attempts: 2 }), () =>
    Promise.resolve(),
  );

  expect(run).rejects.toThrow('is held by another install');

  const owner = await readFile(ctx.lockPath, 'utf8');

  expect(owner).toBe('5005');
  expect(existsSync(`${ctx.lockPath}.4242.dead`)).toBeFalse();
});
