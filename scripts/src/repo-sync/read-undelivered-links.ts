import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { writeStdout } from '../../../packages/std/src/write-stdout.ts';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { UndeliveredLink } from './collect-undelivered-links.ts';
import { collectUndeliveredLinks } from './collect-undelivered-links.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';

export interface UndeliveredLinkPaths {
  readonly manifest: string;

  // The checkouts that a source of zgeoff/tools and one of zgeoff/skills resolve in.
  readonly toolsRoot: string;
  readonly skillsTree: string;
}

export type UndeliveredLinkRead =
  | { readonly kind: 'read'; readonly links: readonly UndeliveredLink[] }
  | { readonly kind: 'unparsed' };

export async function readUndeliveredLinks(
  fileSystem: Pick<FileSystem, 'probePath' | 'readText'>,
  paths: Readonly<UndeliveredLinkPaths>,
): Promise<UndeliveredLinkRead> {
  const manifestText = await fileSystem.readText(paths.manifest);

  const value: unknown = JSON.parse(manifestText);
  const manifest = parseSyncEntries(value);

  if (manifest === null) {
    return { kind: 'unparsed' };
  }

  const markdownByTarget = new Map<string, string>();

  const markdownFiles = manifest
    .flatMap((entry) => entry.files)
    .filter((file) => file.target.endsWith('.md'));

  for (const file of markdownFiles) {
    const checkout = file.repo === 'zgeoff/skills' ? paths.skillsTree : paths.toolsRoot;
    const path = join(checkout, file.source);

    // The check reports a missing source on its own line.
    const exists = await fileSystem.probePath(path);

    if (exists) {
      const text = await fileSystem.readText(path);

      markdownByTarget.set(file.target, text);
    }
  }

  return { kind: 'read', links: collectUndeliveredLinks(manifest, markdownByTarget) };
}

// The manifest check tells an unparsed manifest from a failed read by this exit code.
const unparsedExitCode = 3;

if (import.meta.main) {
  const [manifest = '', skillsTree = ''] = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
  }).positionals;

  // The manifest check prints this stderr inside its one-line report, so a stack trace goes.
  const read = await readUndeliveredLinks(nodeFileSystem, {
    manifest,
    toolsRoot: process.cwd(),
    skillsTree,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`${message}\n`);

    return null;
  });

  if (read === null) {
    process.exitCode = 1;
  } else if (read.kind === 'unparsed') {
    process.exitCode = unparsedExitCode;
  } else {
    writeStdout(
      read.links
        .map((link) => `${link.entry}\t${link.source}\t${link.link}\t${link.owners.join(', ')}\n`)
        .join(''),
    );
  }
}
