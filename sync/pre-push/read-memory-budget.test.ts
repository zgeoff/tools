import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { readMemoryBudget, readOptionalText } from './read-memory-budget.ts';

// Bun's skipIf takes a boolean at collection time, so the cap modes this host supports are probed
// once here; the CLI test needs a mode that caps its process.
const capModes = await $`bash ${join(import.meta.dir, 'run-memory-capped.sh')} --modes`.text();

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-memory-budget-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, procRoot: join(directory, 'proc'), cgroupRoot: join(directory, 'cgroup') };
}

test('it reads the total memory when no cgroup caps the process', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '0::/user.slice/session.scope\n',
    'cgroup/user.slice/memory.max': 'max\n',
    'cgroup/user.slice/session.scope/memory.max': 'max\n',
  });

  const budget = await readMemoryBudget({
    totalMemory: 16 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(budget).toBe(16 * 1024 ** 3);
});

test('it reads the tightest cap among the cgroup and its ancestors', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '0::/agents.slice/agent-7.scope\n',
    'cgroup/agents.slice/memory.max': `${3 * 1024 ** 3}\n`,
    'cgroup/agents.slice/agent-7.scope/memory.max': `${6 * 1024 ** 3}\n`,
  });

  const budget = await readMemoryBudget({
    totalMemory: 16 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(budget).toBe(3 * 1024 ** 3);
});

test('it reads the total memory when every cgroup cap is above it', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '0::/agents.slice\n',
    'cgroup/agents.slice/memory.max': `${32 * 1024 ** 3}\n`,
  });

  const budget = await readMemoryBudget({
    totalMemory: 2 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(budget).toBe(2 * 1024 ** 3);
});

test('it reads the total memory on a host with cgroup v1 alone', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'proc/self/cgroup': '4:memory:/agents\n1:cpu:/agents\n',
  });

  const budget = await readMemoryBudget({
    totalMemory: 8 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(budget).toBe(8 * 1024 ** 3);
});

test('it reads the total memory on a host with no procfs', async () => {
  const ctx = await setupTest();

  const budget = await readMemoryBudget({
    totalMemory: 8 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
    readText: readOptionalText,
  });

  expect(budget).toBe(8 * 1024 ** 3);
});

test.skipIf(capModes === '')(
  'it prints the budget in MiB, which a cgroup cap on the process sets',
  async () => {
    const result =
      await $`bash ${join(import.meta.dir, 'run-memory-capped.sh')} 512 bun ${join(import.meta.dir, 'read-memory-budget.ts')}`.quiet();

    expect(result.stdout.toString()).toBe('512\n');
  },
);
