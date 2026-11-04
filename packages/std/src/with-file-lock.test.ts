import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { createLockHolder } from './test-utils/create-lock-holder.ts';
import { runLockContender } from './test-utils/run-lock-contender.ts';
import { withFileLock } from './with-file-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('with-file-lock-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    lockPath: join(directory, 'build.lock'),
    logPath: join(directory, 'holders.log'),
  };
}

test('it runs the callback and returns its value', async () => {
  const ctx = await setupTest();
  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it reports busy, with the holder, while another process holds the lock', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({
    kind: 'busy',
    holder: {
      pid: holder.pid,
      host: hostname(),
      token: expect.any(String),
      acquiredAt: expect.any(String),
    },
  });
});

test('it takes the lock once its holder lets go within the wait', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const pending = withFileLock(ctx.lockPath, () => Promise.resolve('built'), { waitMs: 5000 });

  await holder.release();

  const result = await pending;

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it takes the lock of a holder that was killed', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  await holder.kill();

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it lets one contender at a time take the lock of a killed holder', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const names = ['a', 'b', 'c', 'd', 'e'];

  const contenders = Promise.all(
    names.map((name) =>
      runLockContender({ lockPath: ctx.lockPath, logPath: ctx.logPath, name, waitMs: 10_000 }),
    ),
  );

  await holder.kill();

  const kinds = await contenders;
  const log = await readFile(ctx.logPath, 'utf8');

  const lines = log.trimEnd().split('\n');
  const order = lines.filter((line) => line.startsWith('start ')).map((line) => line.slice(6));

  expect(kinds).toStrictEqual(['ran', 'ran', 'ran', 'ran', 'ran']);
  expect(lines).toStrictEqual(order.flatMap((name) => [`start ${name}`, `end ${name}`]));
});

test('it reports busy to a contender that gives up while the holder runs', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  const kind = await runLockContender({
    lockPath: ctx.lockPath,
    logPath: ctx.logPath,
    name: 'late',
    waitMs: 100,
  });

  expect(kind).toBe('busy');
});

test('it holds the lock for as long as the callback runs', async () => {
  const ctx = await setupTest();

  const result = await withFileLock(ctx.lockPath, () =>
    runLockContender({ lockPath: ctx.lockPath, logPath: ctx.logPath, name: 'inside', waitMs: 0 }),
  );

  expect(result).toStrictEqual({ kind: 'ran', value: 'busy' });
});

test('it reports busy to a second call in the same process', async () => {
  const ctx = await setupTest();

  const result = await withFileLock(ctx.lockPath, () =>
    withFileLock(ctx.lockPath, () => Promise.resolve('inner')),
  );

  expect(result).toStrictEqual({
    kind: 'ran',
    value: { kind: 'busy', holder: expect.objectContaining({ pid: process.pid }) },
  });
});

test('it lets go of the lock when the callback throws', async () => {
  const ctx = await setupTest();

  await withFileLock(ctx.lockPath, () => {
    throw new Error('build failed');
  }).catch(() => null);

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it rethrows the error of the callback', async () => {
  const ctx = await setupTest();

  expect(
    withFileLock(ctx.lockPath, () => {
      throw new Error('build failed');
    }),
  ).rejects.toThrowWithMessage(Error, 'build failed');
});

test('it lets go of the lock while a process the callback started still runs', async () => {
  const ctx = await setupTest();

  await withFileLock(ctx.lockPath, () => {
    const child = Bun.spawn(['sleep', '30'], { stdout: 'ignore' });

    onTestFinished(() => {
      child.kill('SIGKILL');
    });

    return Promise.resolve();
  });

  const kind = await runLockContender({
    lockPath: ctx.lockPath,
    logPath: ctx.logPath,
    name: 'after',
    waitMs: 0,
  });

  expect(kind).toBe('ran');
});

test('it takes a lock whose file holds a partial record', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.lockPath, '{"pid":12');

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'ran', value: 'built' });
});

test('it reports busy with no holder when the record is partial', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  await writeFile(ctx.lockPath, '{"pid":12');

  const result = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(result).toStrictEqual({ kind: 'busy', holder: null });
});

test('it clears its record when it lets go', async () => {
  const ctx = await setupTest();

  await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  const record = await readFile(ctx.lockPath, 'utf8');

  expect(record).toBe('');
});

test('it keeps the holder record for each caller that finds the lock busy', async () => {
  const ctx = await setupTest();
  const holder = await createLockHolder(ctx.lockPath);

  onTestFinished(holder.kill);

  await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  const second = await withFileLock(ctx.lockPath, () => Promise.resolve('built'));

  expect(second).toStrictEqual({
    kind: 'busy',
    holder: expect.objectContaining({ pid: holder.pid }),
  });
});
