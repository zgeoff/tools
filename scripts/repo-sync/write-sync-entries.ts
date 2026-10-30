import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';
import { pickSyncEntries } from './pick-sync-entries.ts';

export interface WriteSyncEntriesOptions {
  readonly cwd: string;
  readonly skip: string;
  readonly include: string;
  readonly outputPath: string;
  readonly fileSystem: Pick<FileSystem, 'appendText' | 'readText'>;

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

  await writeStepOutputs(options.fileSystem, options.outputPath, {
    entries: JSON.stringify(picked.entries),
  });

  return 0;
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
