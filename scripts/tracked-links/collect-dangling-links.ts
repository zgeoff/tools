import { posix } from 'node:path';
import invariant from 'tiny-invariant';

export interface TrackedLink {
  // The link's path from the repo root.
  readonly path: string;

  // What the link points to, as git stores it.
  readonly target: string;
}

export interface DanglingLink extends TrackedLink {
  // The path the link reaches from the repo root, after every tracked link on the way; an absolute
  // target stays as it is.
  readonly resolved: string;
}

interface LinkTree {
  readonly files: ReadonlySet<string>;

  // Each folder that holds a tracked path, with the repo root as '.'.
  readonly folders: ReadonlySet<string>;

  readonly targets: ReadonlyMap<string, string>;
}

// Returns each link that reaches neither a tracked file nor a folder that holds one, since git
// makes no folder for a path it doesn't track, and the link dangles in a fresh clone.
export function collectDanglingLinks(
  links: readonly TrackedLink[],
  trackedPaths: readonly string[],
): DanglingLink[] {
  const tree: LinkTree = {
    files: new Set(trackedPaths),
    folders: collectFolders(trackedPaths),
    targets: new Map(links.map((link) => [link.path, link.target])),
  };

  const dangling: DanglingLink[] = [];

  for (const link of links) {
    const resolved = resolveLinkPath(link, tree);

    const isReachable =
      resolved !== null && (tree.folders.has(resolved) || tree.files.has(resolved));

    if (!isReachable) {
      dangling.push({ ...link, resolved: resolved ?? joinTarget(link) });
    }
  }

  return dangling;
}

function collectFolders(trackedPaths: readonly string[]): Set<string> {
  const folders = new Set(['.']);

  for (const path of trackedPaths) {
    for (let folder = posix.dirname(path); folder !== '.'; folder = posix.dirname(folder)) {
      folders.add(folder);
    }
  }

  return folders;
}

// The most links Linux follows in one path lookup before it fails with ELOOP.
const maxLinkHops = 40;

// Walks the target one part at a time, as the file system does: a `..` or a later part needs the
// path so far to be a folder, which a collapsed path such as `file/..` would hide. Returns the
// path reached, an absolute target as it is, or null for a path the file system refuses.
function resolveLinkPath(link: TrackedLink, tree: LinkTree): string | null {
  if (posix.isAbsolute(link.target)) {
    return link.target;
  }

  const parent = posix.dirname(link.path);
  const pending = [...(parent === '.' ? [] : parent.split('/')), ...link.target.split('/')];
  const reached: string[] = [];
  let hops = 0;

  while (pending.length > 0) {
    const part = pending.shift();

    invariant(part !== undefined, 'a non-empty list has a first part');

    const current = reached.length === 0 ? '.' : reached.join('/');

    if (part === '.' || part === '') {
      // An empty part follows a slash, and a slash needs a folder before it.
      if (part === '' && !tree.folders.has(current)) {
        return null;
      }

      continue;
    }

    if (part === '..') {
      if (reached.length === 0 || !tree.folders.has(current)) {
        return null;
      }

      reached.pop();
      continue;
    }

    const candidate = [...reached, part].join('/');
    const target = tree.targets.get(candidate);

    if (target !== undefined) {
      hops += 1;

      if (hops > maxLinkHops) {
        return null;
      }

      if (posix.isAbsolute(target)) {
        return target;
      }

      pending.unshift(...target.split('/'));
      continue;
    }

    if (pending.length > 0 && !tree.folders.has(candidate)) {
      return null;
    }

    reached.push(part);
  }

  return reached.length === 0 ? '.' : reached.join('/');
}

function joinTarget(link: TrackedLink): string {
  if (posix.isAbsolute(link.target)) {
    return link.target;
  }

  return posix.normalize(posix.join(posix.dirname(link.path), link.target)).replace(/\/+$/u, '');
}
