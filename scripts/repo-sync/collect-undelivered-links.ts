import { posix } from 'node:path';
import { collectNeededNames } from './collect-needed-names.ts';
import type { SyncEntry } from './parse-sync-entries.ts';

// A link in a delivered Markdown file to a file or folder that only other entries deliver, which a
// repo that takes the linking entry can lack.
export interface UndeliveredLink {
  readonly entry: string;
  readonly source: string;
  readonly link: string;

  // The entries that deliver a file at the linked path or below it.
  readonly owners: readonly string[];
}

export function collectUndeliveredLinks(
  manifest: readonly SyncEntry[],
  markdownByTarget: ReadonlyMap<string, string>,
): UndeliveredLink[] {
  const everyRepo = manifest.filter((entry) => !entry.optIn);

  return manifest.flatMap((entry) => {
    const taken = collectNeededNames(manifest, [entry, ...everyRepo], []);

    const delivered = manifest
      .filter((candidate) => taken.has(candidate.name))
      .flatMap((candidate) => candidate.files.map((file) => file.target));

    return entry.files.flatMap((file) =>
      collectRelativeLinks(markdownByTarget.get(file.target) ?? '').flatMap((link) => {
        const linked = resolveLinkedPath(file.target, link);

        const owners = manifest
          .filter((owner) => owner.files.some((ownerFile) => isAtOrBelow(ownerFile.target, linked)))
          .map((owner) => owner.name);

        return owners.length === 0 || delivered.some((target) => isAtOrBelow(target, linked))
          ? []
          : [{ entry: entry.name, source: file.source, link, owners }];
      }),
    );
  });
}

const inlineLinkPattern = /\]\(\s*(?:<(?<angled>[^>\n]+)>|(?<bare>[^)\s]+))/gu;
const definitionPattern = /^ {0,3}\[[^\]\n]+\]:\s*(?:<(?<angled>[^>\n]+)>|(?<bare>\S+))/gmu;

function collectRelativeLinks(text: string): string[] {
  const links = [...text.matchAll(inlineLinkPattern), ...text.matchAll(definitionPattern)]
    .map((match) => (match.groups?.['angled'] ?? match.groups?.['bare'] ?? '').split('#')[0] ?? '')
    .filter((link) => link !== '');

  return [...new Set(links)];
}

// GitHub resolves a link that starts with a slash from the repo root.
function resolveLinkedPath(target: string, link: string): string {
  const joined = link.startsWith('/') ? link.slice(1) : posix.join(posix.dirname(target), link);

  return posix.normalize(joined).replace(/\/$/u, '');
}

function isAtOrBelow(target: string, linked: string): boolean {
  return target === linked || target.startsWith(`${linked}/`);
}
