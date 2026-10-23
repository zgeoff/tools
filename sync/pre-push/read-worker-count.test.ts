import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { readOptionalText } from './read-memory-budget.ts';
import { readWorkerCount } from './read-worker-count.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-worker-count-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, procRoot: join(directory, 'proc'), cgroupRoot: join(directory, 'cgroup') };
}

test.each([
  ['a 2-core host with 2 GiB', 1, 2, 2 * 1024 ** 3],
  ['a 4-core host with 3.9 GiB', 1, 4, 3.9 * 1024 ** 3],
  ['a 2-core host with 8 GB', 2, 2, 8e9],
  ['a 4-core host with 16 GB', 4, 4, 16e9],
  ['a 16-core host with 30 GB', 4, 16, 30e9],
])('it gives %s a worker count of %d', async (_label, expected, cores, totalMemory) => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '0::/user.slice\n',
    'cgroup/user.slice/memory.max': 'max\n',
  });

  const workers = await readWorkerCount({
    env: {},
    cores,
    totalMemory,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(workers).toStrictEqual({ kind: 'count', count: expected });
});

test('it gives 1 worker on a large host whose cgroup caps it under 4 GiB', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '0::/agents.slice\n',
    'cgroup/agents.slice/memory.max': `${2 * 1024 ** 3}\n`,
  });

  const workers = await readWorkerCount({
    env: {},
    cores: 16,
    totalMemory: 30e9,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(workers).toStrictEqual({ kind: 'count', count: 1 });
});

test('it gives the TEST_WORKERS count over the one the host would get', async () => {
  const ctx = await setupTest();

  const workers = await readWorkerCount({
    env: { TEST_WORKERS: '6' },
    cores: 2,
    totalMemory: 2 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(workers).toStrictEqual({ kind: 'count', count: 6 });
});

test.each(['0', '2.5', 'four', '', '9'.repeat(309)])(
  'it refuses a TEST_WORKERS of %p',
  async (value) => {
    const ctx = await setupTest();

    const workers = await readWorkerCount({
      env: { TEST_WORKERS: value },
      cores: 2,
      totalMemory: 2 * 1024 ** 3,
      procRoot: ctx.procRoot,
      cgroupRoot: ctx.cgroupRoot,
      readText: readOptionalText,
    });

    expect(workers).toStrictEqual({
      kind: 'invalid',
      message: `TEST_WORKERS is ${value}; set it to a whole number above 0`,
    });
  },
);

test('it prints the count', async () => {
  const result = await $`bun ${join(import.meta.dir, 'read-worker-count.ts')}`
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: '3' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '3\n', stderr: '' });
});

test('it exits 2 with the reason for a TEST_WORKERS it refuses', async () => {
  const result = await $`bun ${join(import.meta.dir, 'read-worker-count.ts')}`
    .env({ PATH: process.env['PATH'] ?? '', TEST_WORKERS: 'all' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'read-worker-count: TEST_WORKERS is all; set it to a whole number above 0\n',
  });
});
