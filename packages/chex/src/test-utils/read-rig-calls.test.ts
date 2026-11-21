import { expect, test } from 'bun:test';
import { createStubBin } from '@zgeoff/testing/bin';
import { createTempDir } from '@zgeoff/testing/fs';
import { run } from '@zgeoff/testing/process';
import { readRigCalls } from './read-rig-calls.ts';

test('it reads the calls of the stub rig and none of the other stubs, and marks a call under diet', async () => {
  const directory = createTempDir('read-rig-calls').path;
  const rig = createStubBin(directory, 'rig', { recordEnv: ['CHEX_STUB_UNDER_DIET'] });
  const diet = createStubBin(directory, 'diet');

  await run([rig.path, 'related', 'kettle.ts']);
  await run([diet.path, '--', 'ls']);
  await run([rig.path, 'related', 'lid.ts'], { env: { CHEX_STUB_UNDER_DIET: '1' } });

  expect(readRigCalls(directory)).toStrictEqual([
    { argv: ['related', 'kettle.ts'], isUnderDiet: false },
    { argv: ['related', 'lid.ts'], isUnderDiet: true },
  ]);
});

test('it reads no calls from a folder where no stub ran', () => {
  const directory = createTempDir('read-rig-calls').path;

  expect(readRigCalls(directory)).toStrictEqual([]);
});
