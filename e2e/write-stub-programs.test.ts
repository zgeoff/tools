import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeStubPrograms } from '../test-utils/write-stub-programs.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-stub-programs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { folder: join(directory, 'bin') };
}

test('it writes each program as an executable script that runs its body', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(ctx.folder, { kettle: 'echo "boils $1"', lid: 'exit 3' });

  const kettle = await $`${join(ctx.folder, 'kettle')} water`.nothrow().quiet();
  const lid = await $`${join(ctx.folder, 'lid')}`.nothrow().quiet();

  expect(kettle.stdout.toString()).toBe('boils water\n');
  expect(lid.exitCode).toBe(3);
});
