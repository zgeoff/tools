import { posix } from 'node:path';

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

// Returns each link that reaches neither a tracked file nor a folder that holds one, since git
// makes no folder for a path it doesn't track, and the link dangles in a fresh clone.
export function collectDanglingLinks(
  links: readonly TrackedLink[],
  trackedPaths: readonly string[],
): DanglingLink[] {
  const tracked = new Set(trackedPaths);
  const targets = new Map(links.map((link) => [link.path, link.target]));

  const dangling: DanglingLink[] = [];

  for (const link of links) {
    const lexical = joinTarget(link.path, link.target);
    const resolved = resolveLinkPath(lexical, targets, 1);

    if (resolved === '.') {
      continue;
    }

    const isFolder =
      resolved !== null && trackedPaths.some((path) => path.startsWith(`${resolved}/`));

    // The file system refuses a slash-ended target that names a file, with ENOTDIR.
    const isReachable = link.target.endsWith('/')
      ? isFolder
      : isFolder || (resolved !== null && tracked.has(resolved));

    if (!isReachable) {
      dangling.push({ ...link, resolved: resolved ?? lexical });
    }
  }

  return dangling;
}

function joinTarget(linkPath: string, target: string): string {
  if (posix.isAbsolute(target)) {
    return target;
  }

  return posix.normalize(posix.join(posix.dirname(linkPath), target)).replace(/\/+$/u, '');
}

// The most links Linux follows in one path lookup before it fails with ELOOP.
const maxLinkHops = 40;

// Follows each tracked link in the path, as the file system does, and returns null for a loop.
function resolveLinkPath(
  path: string,
  targets: ReadonlyMap<string, string>,
  hops: number,
): string | null {
  if (hops > maxLinkHops) {
    return null;
  }

  const parts = path.split('/');

  for (let index = 1; index <= parts.length; index += 1) {
    const prefix = parts.slice(0, index).join('/');
    const target = targets.get(prefix);

    if (target !== undefined) {
      const rest = parts.slice(index).join('/');
      const restOfTarget = rest === '' ? target : posix.join(target, rest);
      const next = joinTarget(prefix, restOfTarget);

      return posix.isAbsolute(next) ? next : resolveLinkPath(next, targets, hops + 1);
    }
  }

  return path;
}
