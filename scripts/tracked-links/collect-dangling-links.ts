import { posix } from 'node:path';
import invariant from 'tiny-invariant';

export interface TrackedLink {
  // The link's path from the repo root.
  readonly path: string;

  // What the link points to, as git stores it.
  readonly target: string;
}

export type DanglingCause =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'not-a-folder'; readonly path: string }
  | { readonly kind: 'outside-repo' }
  | { readonly kind: 'loop' };

export interface DanglingLink extends TrackedLink {
  readonly cause: DanglingCause;
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

  return links.flatMap((link) => {
    const cause = findDanglingCause(link, tree);

    return cause === null ? [] : [{ ...link, cause }];
  });
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
// path so far to be a folder, which a collapsed path such as `file/..` would hide. A part joins the
// path so far only once it is known to be a folder or is the last part.
function findDanglingCause(link: TrackedLink, tree: LinkTree): DanglingCause | null {
  if (posix.isAbsolute(link.target)) {
    return { kind: 'outside-repo' };
  }

  const parent = posix.dirname(link.path);
  const pending = [...(parent === '.' ? [] : parent.split('/')), ...link.target.split('/')];
  const reached: string[] = [];

  // The link itself is the first hop.
  let hops = 1;

  while (pending.length > 0) {
    const part = pending.shift();

    invariant(part !== undefined, 'a non-empty list has a first part');

    if (part === '.' || part === '') {
      continue;
    }

    if (part === '..') {
      if (reached.length === 0) {
        return { kind: 'outside-repo' };
      }

      reached.pop();
      continue;
    }

    const candidate = [...reached, part].join('/');
    const target = tree.targets.get(candidate);

    if (target !== undefined) {
      hops += 1;

      if (hops > maxLinkHops) {
        return { kind: 'loop' };
      }

      if (posix.isAbsolute(target)) {
        return { kind: 'outside-repo' };
      }

      pending.unshift(...target.split('/'));
      continue;
    }

    if (pending.length > 0 && !tree.folders.has(candidate)) {
      return tree.files.has(candidate)
        ? { kind: 'not-a-folder', path: candidate }
        : { kind: 'missing', path: buildMissingPath(candidate, pending) };
    }

    reached.push(part);
  }

  const path = reached.length === 0 ? '.' : reached.join('/');

  return tree.folders.has(path) || tree.files.has(path) ? null : { kind: 'missing', path };
}

// Once one part is missing, so is each part after it, up to a `..`, which can lead back to a path
// that exists.
function buildMissingPath(candidate: string, pending: readonly string[]): string {
  const stepBack = pending.indexOf('..');
  const rest = stepBack === -1 ? pending : pending.slice(0, stepBack);

  return [candidate, ...rest.filter((part) => part !== '' && part !== '.')].join('/');
}
