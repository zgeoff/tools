import type { PinManifestFacts } from './read-pin-manifest-facts.ts';
import { skillsPinPath } from './skills-pin-path.ts';
import { syncManifestPath } from './sync-manifest-path.ts';

export interface CoveredPinHead {
  // The files the open pin pull request changes.
  readonly paths: readonly unknown[];

  // The pin at the branch head, and the one the run read from the branch before it.
  readonly headPin: string | null;
  readonly proposed: string | null;

  // Read only when the pull request changes the manifest.
  readonly manifest: PinManifestFacts | null;
}

// Whether the head shows only the pin pull request's own change: the pin file at the pin the run
// compared, and the manifest as the pin step writes it for that pin, when it changes.
export function isCoveredPinHead(head: Readonly<CoveredPinHead>): boolean {
  if (head.headPin === null || head.headPin !== head.proposed) {
    return false;
  }

  if (!head.paths.includes(skillsPinPath)) {
    return false;
  }

  if (!head.paths.includes(syncManifestPath)) {
    return head.paths.length === 1;
  }

  const expected = head.manifest?.expected ?? null;

  return (
    head.paths.length === 2 &&
    expected !== null &&
    expected.added.length > 0 &&
    head.manifest?.headText === expected.text
  );
}
