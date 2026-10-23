import { totalmem } from 'node:os';
import { join } from 'node:path';

export interface MemoryBudgetSources {
  readonly totalMemory: number;
  readonly procRoot: string;
  readonly cgroupRoot: string;
}

export async function readMemoryBudget(sources: Readonly<MemoryBudgetSources>): Promise<number> {
  const caps = await readCgroupCaps(sources);

  return Math.min(sources.totalMemory, ...caps);
}

async function readCgroupCaps(sources: Readonly<MemoryBudgetSources>): Promise<number[]> {
  const membershipFile = Bun.file(join(sources.procRoot, 'self', 'cgroup'));

  const hasProcfs = await membershipFile.exists();

  // macOS has no procfs.
  if (!hasProcfs) {
    return [];
  }

  const membership = await membershipFile.text();

  const own = /^0::(?<path>\/.*)$/mu.exec(membership)?.groups?.['path'];

  // A host on cgroup v1 alone has no 0:: line.
  if (own === undefined) {
    return [];
  }

  const caps = await Promise.all(
    collectAncestorPaths(own).map((path) =>
      readCgroupCap(join(sources.cgroupRoot, path, 'memory.max')),
    ),
  );

  return caps.filter((cap) => cap !== undefined);
}

function collectAncestorPaths(path: string): string[] {
  const parts = path.split('/').filter((part) => part !== '');

  return ['/', ...parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`)];
}

// The root cgroup has no memory.max, and a cgroup with no cap holds max.
async function readCgroupCap(path: string): Promise<number | undefined> {
  const file = Bun.file(path);

  const exists = await file.exists();

  if (!exists) {
    return undefined;
  }

  const text = await file.text();

  const value = text.trim();

  return value === 'max' ? undefined : Number(value);
}

if (import.meta.main) {
  const budget = await readMemoryBudget({
    totalMemory: totalmem(),
    procRoot: '/proc',
    cgroupRoot: '/sys/fs/cgroup',
  });

  process.stdout.write(`${Math.floor(budget / 1024 / 1024)}\n`);
}
