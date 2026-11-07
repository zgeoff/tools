import { posix } from 'node:path';

export interface TrackedLink {
  // The link's path from the repo root.
  readonly path: string;

  // What the link points to, as git stores it.
  readonly target: string;
}

export interface DanglingLink extends TrackedLink {
  // The target's path from the repo root, or the target itself when it is absolute.
  readonly resolved: string;
}

// Returns each link whose target is neither a tracked path nor a folder that holds one, since git
// makes no folder for a path it doesn't track, and the link dangles in a fresh clone.
export function collectDanglingLinks(
  links: readonly TrackedLink[],
  trackedPaths: readonly string[],
): DanglingLink[] {
  const tracked = new Set(trackedPaths);

  return links
    .map((link) => ({
      ...link,
      resolved: posix.isAbsolute(link.target)
        ? link.target
        : posix.normalize(posix.join(posix.dirname(link.path), link.target)),
    }))
    .filter(
      (link) =>
        !tracked.has(link.resolved) &&
        !trackedPaths.some((path) => path.startsWith(`${link.resolved}/`)),
    );
}
