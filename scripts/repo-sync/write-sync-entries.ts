import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isRecord } from '../../packages/std/src/is-record.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { pickSyncEntries } from './pick-sync-entries.ts';

export interface WriteSyncEntriesOptions {
  readonly cwd: string;
  readonly skip: string;
  readonly include: string;
  readonly outputPath: string;
}

export async function writeSyncEntries(
  options: Readonly<WriteSyncEntriesOptions>,
): Promise<number> {
  const manifestText = await readFile(join(options.cwd, 'sync/manifest.json'), 'utf8');

  const manifest: unknown = JSON.parse(manifestText);

  if (!Array.isArray(manifest) || !manifest.every((entry) => isRecord(entry))) {
    process.stdout.write('::error::sync/manifest.json holds no list of entries\n');

    return 1;
  }

  const picked = pickSyncEntries({ manifest, skip: options.skip, include: options.include });

  if (picked.kind === 'refused') {
    process.stdout.write(`::error::${picked.message}\n`);

    return 1;
  }

  await writeStepOutputs(options.outputPath, {
    entries: JSON.stringify(picked.entries),
    workflows: String(picked.workflows),
  });

  return 0;
}

if (import.meta.main) {
  process.exitCode = await writeSyncEntries({
    cwd: process.cwd(),
    skip: process.env['SKIP'] ?? '',
    include: process.env['INCLUDE'] ?? '',
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
  });
}
