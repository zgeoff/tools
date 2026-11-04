import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { withFileLock } from '../with-file-lock.ts';
import { runLockContender } from './run-lock-contender.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('lock-contender-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { lockPath: join(directory, 'build.lock'), logPath: join(directory, 'holders.log') };
}

test('it logs its start and end while it holds a free lock', async () => {
  const ctx = await setupTest();

  const kind = await runLockContender({
    lockPath: ctx.lockPath,
    logPath: ctx.logPath,
    name: 'solo',
    waitMs: 0,
  });

  const log = await readFile(ctx.logPath, 'utf8');

  expect(kind).toBe('ran');
  expect(log).toBe('start solo\nend solo\n');
});

test('it reports busy for a lock this process holds', async () => {
  const ctx = await setupTest();

  const result = await withFileLock(ctx.lockPath, () =>
    runLockContender({ lockPath: ctx.lockPath, logPath: ctx.logPath, name: 'late', waitMs: 0 }),
  );

  expect(result).toStrictEqual({ kind: 'ran', value: 'busy' });
});

test('it throws when the contender process fails', async () => {
  const ctx = await setupTest();

  expect(
    runLockContender({
      lockPath: join(ctx.lockPath, 'missing', 'build.lock'),
      logPath: ctx.logPath,
      name: 'lost',
      waitMs: 0,
    }),
  ).rejects.toThrowWithMessage(Error, 'the lock contender lost exited with 1');
});
