import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCallLog } from './read-call-log.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-call-log-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { log: join(directory, 'calls') };
}

test('it reads each call the log holds, in order', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.log, 'related kettle.ts\nrelated lid.ts\n');

  const calls = await readCallLog(ctx.log);

  expect(calls).toStrictEqual(['related kettle.ts', 'related lid.ts']);
});

test('it reads no calls from a log the stand-in never wrote', async () => {
  const ctx = await setupTest();
  const calls = await readCallLog(ctx.log);

  expect(calls).toStrictEqual([]);
});
