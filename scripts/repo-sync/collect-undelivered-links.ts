import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { writeStdout } from '../../packages/std/src/write-stdout.ts';
import { collectNeededNames } from './collect-needed-names.ts';
import type { SyncEntry } from './parse-sync-entries.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';

// A link in a delivered Markdown file to a file that another entry delivers, which a repo that
// takes the linking entry can lack.
export interface UndeliveredLink {
  readonly entry: string;
  readonly source: string;
  readonly link: string;

  // The entries that deliver the linked file.
  readonly owners: readonly string[];
}

// The text of each delivered Markdown file, keyed by its target.
export function collectUndeliveredLinks(
  manifest: readonly SyncEntry[],
  markdown: ReadonlyMap<string, string>,
): UndeliveredLink[] {
  const everyRepo = manifest.filter((entry) => !entry.optIn);

  return manifest.flatMap((entry) => {
    const taken = collectNeededNames(manifest, [entry, ...everyRepo], []);

    const delivered = new Set(
      manifest
        .filter((candidate) => taken.has(candidate.name))
        .flatMap((candidate) => candidate.files.map((file) => file.target)),
    );

    return entry.files.flatMap((file) =>
      collectRelativeLinks(markdown.get(file.target) ?? '').flatMap((link) => {
        const linked = posix.normalize(posix.join(posix.dirname(file.target), link));

        const owners = manifest
          .filter((owner) => owner.files.some((ownerFile) => ownerFile.target === linked))
          .map((owner) => owner.name);

        return owners.length === 0 || delivered.has(linked)
          ? []
          : [{ entry: entry.name, source: file.source, link, owners }];
      }),
    );
  });
}

function collectRelativeLinks(text: string): string[] {
  const links = [...text.matchAll(/\]\((?<link>[^)#\s]+)/gu)].map(
    (match) => match.groups?.['link'] ?? '',
  );

  return [...new Set(links)].filter((link) => !/^(?:[a-z][a-z\d+.-]*:|\/)/iu.test(link));
}

// Returns null for a manifest the sync cannot parse.
export function readUndeliveredLinks(
  manifestPath: string,
  toolsRoot: string,
  skillsTree: string,
): UndeliveredLink[] | null {
  const value: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifest = parseSyncEntries(value);

  if (manifest === null) {
    return null;
  }

  const markdown = new Map(
    manifest
      .flatMap((entry) => entry.files)
      .filter((file) => file.target.endsWith('.md'))
      .map((file) => {
        const checkout = file.repo === 'zgeoff/skills' ? skillsTree : toolsRoot;

        return { target: file.target, path: join(checkout, file.source) };
      })
      .filter((file) => existsSync(file.path))
      .map((file) => [file.target, readFileSync(file.path, 'utf8')] as const),
  );

  return collectUndeliveredLinks(manifest, markdown);
}

if (import.meta.main) {
  const links = readUndeliveredLinks(process.argv[2] ?? '', process.cwd(), process.argv[3] ?? '');

  if (links === null) {
    process.exitCode = 1;
  } else {
    writeStdout(
      links
        .map((link) => `${link.entry}\t${link.source}\t${link.link}\t${link.owners.join(', ')}\n`)
        .join(''),
    );
  }
}
