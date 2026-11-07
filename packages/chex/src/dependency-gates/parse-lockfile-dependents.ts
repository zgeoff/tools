import { isRecord } from './is-record.ts';
import type { LockfileDependent } from './types.ts';

// A root override reaches a workspace's own dependencies too, so the workspaces' ranges count
// beside the ranges of the registry packages.
export function parseLockfileDependents(lockfile: string): LockfileDependent[] {
  const parsed: unknown = Bun.JSONC.parse(lockfile);
  const workspaces = isRecord(parsed) ? parsed['workspaces'] : undefined;
  const packages = isRecord(parsed) ? parsed['packages'] : undefined;

  if (!isRecord(workspaces)) {
    throw new TypeError('bun.lock has no workspaces object');
  }

  if (!isRecord(packages)) {
    throw new TypeError('bun.lock has no packages object');
  }

  return [
    ...Object.entries(workspaces).flatMap(([path, workspace]) =>
      collectWorkspaceDependents(path, workspace),
    ),
    ...Object.values(packages).flatMap((entry) => collectPackageDependents(entry)),
  ];
}

const workspaceFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function collectWorkspaceDependents(path: string, workspace: unknown): LockfileDependent[] {
  const dependent = buildWorkspaceID(path, workspace);

  return collectDeclaredRanges(dependent, workspace, workspaceFields);
}

// A nested override key names its parent by package name, whether the parent is a workspace or a
// registry package, so a workspace with a name takes it in place of its path.
function buildWorkspaceID(path: string, workspace: unknown): string {
  const name = isRecord(workspace) ? workspace['name'] : undefined;
  const version = isRecord(workspace) ? workspace['version'] : undefined;

  if (typeof name !== 'string') {
    return path === '' ? 'the root workspace' : path;
  }

  return typeof version === 'string' ? `${name}@${version}` : name;
}

function collectDeclaredRanges(
  dependent: string,
  metadata: unknown,
  fields: readonly string[],
): LockfileDependent[] {
  if (!isRecord(metadata)) {
    return [];
  }

  return fields.flatMap((field) => {
    const ranges = metadata[field];

    if (!isRecord(ranges)) {
      return [];
    }

    return Object.entries(ranges).flatMap(([name, range]) =>
      typeof range === 'string' ? [{ dependent, name, range }] : [],
    );
  });
}

const packageFields = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

// A registry entry is [id, registry, metadata, integrity]; a workspace or link entry is shorter.
function collectPackageDependents(entry: unknown): LockfileDependent[] {
  const [dependent, , metadata] = isList(entry) ? entry : [];

  if (typeof dependent !== 'string') {
    throw new TypeError('bun.lock has a package entry that does not start with its id');
  }

  return collectDeclaredRanges(dependent, metadata, packageFields);
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
