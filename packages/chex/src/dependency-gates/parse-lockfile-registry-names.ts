import { isRecord } from './is-record.ts';

// An entry's id is `<name>@<version>`. A workspace, link, file or git entry carries a protocol in
// its version, such as `workspace:packages/std`, and bun never puts it through the age gate.
export interface LockfileRegistryPackage {
  readonly name: string;
  readonly version: string;
}

export function parseLockfileRegistryNames(lockfile: string): string[] {
  return [
    ...new Set(parseLockfileRegistryPackages(lockfile).map((entry) => entry.name)),
  ].toSorted();
}

export function parseLockfileRegistryPackages(lockfile: string): LockfileRegistryPackage[] {
  const parsed: unknown = Bun.JSONC.parse(lockfile);
  const packages = isRecord(parsed) ? parsed['packages'] : undefined;

  if (!isRecord(packages)) {
    throw new TypeError('bun.lock has no packages object');
  }

  const found = Object.values(packages).flatMap((entry) => {
    const id: unknown = Array.isArray(entry) ? entry[0] : undefined;

    if (typeof id !== 'string') {
      throw new TypeError('bun.lock has a package entry that does not start with its id');
    }

    const versionStart = id.indexOf('@', 1);
    const version = id.slice(versionStart + 1);

    return versionStart > 0 && !version.includes(':')
      ? [{ name: id.slice(0, versionStart), version }]
      : [];
  });

  return found.toSorted(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
}
