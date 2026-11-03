import { join } from 'node:path';
import { isRecord } from '../../packages/std/src/is-record.ts';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { collectUnreadManifestKeys } from './collect-unread-manifest-keys.ts';
import { parseSkillsPin } from './parse-skills-pin.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';
import { pickSyncEntries } from './pick-sync-entries.ts';
import { skillsPinPath } from './skills-pin-path.ts';

export interface WriteSyncEntriesOptions {
  readonly cwd: string;
  readonly skip: string;
  readonly include: string;
  readonly outputPath: string;
  readonly fileSystem: Pick<FileSystem, 'appendText' | 'probePath' | 'readText'>;

  // Receives the step's error lines.
  readonly writeOutput: (text: string) => void;
}

export async function writeSyncEntries(
  options: Readonly<WriteSyncEntriesOptions>,
): Promise<number> {
  const manifestText = await options.fileSystem.readText(join(options.cwd, 'sync/manifest.json'));

  const manifestValue: unknown = JSON.parse(manifestText);
  const manifest = parseSyncEntries(manifestValue);

  if (manifest === null) {
    options.writeOutput('::error::sync/manifest.json holds no list of valid entries\n');

    return 1;
  }

  const picked = pickSyncEntries({ manifest, skip: options.skip, include: options.include });

  if (picked.kind === 'refused') {
    options.writeOutput(`::error::${picked.message}\n`);

    return 1;
  }

  const unread = picked.entries
    .map((entry) => ({
      name: entry.name,
      keys: collectUnreadManifestKeys(findManifestEntry(manifestValue, entry.name)),
    }))
    .filter((found) => found.keys.length > 0);

  for (const found of unread) {
    options.writeOutput(
      `::error::${found.name} holds ${found.keys.join(', ')}, which these repo-sync scripts do not read, so the sync leaves it out; a run on a newer repo-sync pin reads it.\n`,
    );
  }

  const unreadNames = unread.map((found) => found.name);
  const entries = picked.entries.filter((entry) => !unreadNames.includes(entry.name));

  const skillsPin = await readSkillsPin(options);

  if (skillsPin.kind === 'refused') {
    options.writeOutput(`::error::${skillsPin.message}\n`);

    return 1;
  }

  const needsSkills = entries.some((entry) =>
    entry.files.some((file) => file.repo === 'zgeoff/skills'),
  );

  if (needsSkills && skillsPin.commit === '') {
    options.writeOutput(
      `::error::An entry takes its sources from zgeoff/skills, but the tools ref has no ${skillsPinPath}\n`,
    );

    return 1;
  }

  await writeStepOutputs(options.fileSystem, options.outputPath, {
    entries: JSON.stringify(entries),
    'skills-ref': skillsPin.commit,
    unread: unreadNames.join(','),
  });

  return 0;
}

function findManifestEntry(manifest: unknown, name: string): unknown {
  return Array.isArray(manifest)
    ? manifest.find((entry: unknown) => isRecord(entry) && entry['name'] === name)
    : undefined;
}

type SkillsPin =
  | { readonly kind: 'read'; readonly commit: string }
  | { readonly kind: 'refused'; readonly message: string };

// A tools ref from before the skill text moved to zgeoff/skills holds no pin, and the sync job then
// checks out no zgeoff/skills.
async function readSkillsPin(options: Readonly<WriteSyncEntriesOptions>): Promise<SkillsPin> {
  const path = join(options.cwd, skillsPinPath);

  const exists = await options.fileSystem.probePath(path);

  if (!exists) {
    return { kind: 'read', commit: '' };
  }

  const pinText = await options.fileSystem.readText(path);

  const pinValue: unknown = JSON.parse(pinText);
  const commit = parseSkillsPin(pinValue);

  return commit === null
    ? { kind: 'refused', message: `${skillsPinPath} holds no full commit ID of zgeoff/skills` }
    : { kind: 'read', commit };
}

if (import.meta.main) {
  process.exitCode = await writeSyncEntries({
    cwd: process.cwd(),
    skip: process.env['SKIP'] ?? '',
    include: process.env['INCLUDE'] ?? '',
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
    fileSystem: nodeFileSystem,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
