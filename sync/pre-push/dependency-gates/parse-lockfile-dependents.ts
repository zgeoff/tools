import { isRecord } from './is-record.ts';
import type { LockfileDependent } from './types.ts';

export function parseLockfileDependents(lockfile: string): LockfileDependent[] {
  const parsed: unknown = Bun.JSONC.parse(lockfile);
  const packages = isRecord(parsed) ? parsed['packages'] : undefined;

  if (!isRecord(packages)) {
    throw new TypeError('bun.lock has no packages object');
  }

  return Object.values(packages).flatMap((entry) => collectEntryDependents(entry));
}

const rangeFields = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

// A registry entry is [id, registry, metadata, integrity]; a workspace or link entry is shorter.
function collectEntryDependents(entry: unknown): LockfileDependent[] {
  const [dependent, , metadata]: unknown[] = Array.isArray(entry) ? entry : [];

  if (typeof dependent !== 'string') {
    throw new TypeError('bun.lock has a package entry that does not start with its id');
  }

  if (!isRecord(metadata)) {
    return [];
  }

  return rangeFields.flatMap((field) => {
    const ranges = metadata[field];

    if (!isRecord(ranges)) {
      return [];
    }

    return Object.entries(ranges).flatMap(([name, range]) =>
      typeof range === 'string' ? [{ dependent, name, range }] : [],
    );
  });
}
