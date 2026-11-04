import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { withLedgerLock } from './with-ledger-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('with-ledger-lock-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it runs the job of a session with no ledger', async () => {
  const value = await withLedgerLock(null, () => Promise.resolve('recorded'));

  expect(value).toBe('recorded');
});

test('it runs the jobs on one ledger one at a time', async () => {
  const ctx = await setupTest();

  const ledgerPath = join(ctx.directory, 'state', 'ledger.json');
  const counterPath = join(ctx.directory, 'counter');

  await writeFile(counterPath, '0');

  await Promise.all(
    Array.from({ length: 20 }, () =>
      withLedgerLock(ledgerPath, async () => {
        const text = await readFile(counterPath, 'utf8');

        const count = Number(text);

        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        await writeFile(counterPath, String(count + 1));
      }),
    ),
  );

  const count = await readFile(counterPath, 'utf8');

  expect(count).toBe('20');
});
