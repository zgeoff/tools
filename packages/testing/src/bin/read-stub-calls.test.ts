import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { run } from '../process/index.ts';
import { createStubBin } from './create-stub-bin.ts';
import { readStubCalls } from './read-stub-calls.ts';

function setupTest() {
  return { directory: createTempDir('stub-calls').path };
}

test('it reads a folder with no log as no calls', () => {
  const ctx = setupTest();

  expect(readStubCalls(ctx.directory)).toStrictEqual([]);
});

test('it reads every call to every stand-in in the folder, in call order', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh');
  const op = createStubBin(ctx.directory, 'op');

  await run([gh.path, 'pr', 'view']);
  await run([op.path, 'read']);

  expect(
    readStubCalls(ctx.directory).map((call) => `${call.name} ${call.argv.join(' ')}`),
  ).toStrictEqual(['gh pr view', 'op read']);
});

test('it throws on a log line that is no call', () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.directory, 'calls.jsonl'), '{"name":"gh"}\n');

  expect(() => readStubCalls(ctx.directory)).toThrow('holds a line that is no stub call');
});
