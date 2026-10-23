import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { readMemoryBudget } from './read-memory-budget.ts';

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
  });

  expect(budget).toBe(8 * 1024 ** 3);
});

test('it reads the total memory on a host with no procfs', async () => {
  const ctx = await setupTest();

  const budget = await readMemoryBudget({
    totalMemory: 8 * 1024 ** 3,
    procRoot: ctx.procRoot,
    cgroupRoot: ctx.cgroupRoot,
  });

  expect(budget).toBe(8 * 1024 ** 3);
});

test('it prints the budget of this host in MiB', async () => {
  const result = await $`bun ${join(import.meta.dir, 'read-memory-budget.ts')}`.quiet();

  expect(result.stdout.toString()).toMatch(/^[1-9]\d*\n$/u);
});
