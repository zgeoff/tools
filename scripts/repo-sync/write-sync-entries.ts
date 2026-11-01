import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
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

  const skillsPin = await readSkillsPin(options);

  if (skillsPin.kind === 'refused') {
    options.writeOutput(`::error::${skillsPin.message}\n`);

    return 1;
  }

  const needsSkills = picked.entries.some((entry) =>
    entry.files.some((file) => file.repo === 'zgeoff/skills'),
  );

  if (needsSkills && skillsPin.commit === '') {
    options.writeOutput(
      `::error::An entry takes its sources from zgeoff/skills, but the tools ref has no ${skillsPinPath}\n`,
    );

    return 1;
  }

  await writeStepOutputs(options.fileSystem, options.outputPath, {
    entries: JSON.stringify(picked.entries),
    'skills-ref': skillsPin.commit,
  });

  return 0;
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
