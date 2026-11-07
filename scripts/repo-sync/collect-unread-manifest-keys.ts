import { readFileSync } from 'node:fs';
import { isRecord } from '../../packages/std/src/is-record.ts';
import { writeStdout } from '../../packages/std/src/write-stdout.ts';

// A run syncs a tools commit that can be newer than its own pinned scripts, so its manifest can hold
// a key these scripts skip, and a skipped key such as a file's source repo copies the wrong file.
const entryKeys = new Set([
  'name',
  'description',
  'files',
  'build',
  'optIn',
  'scripts',
  'packages',
  'needs',
]);

const fileKeys = new Set(['repo', 'source', 'target', 'mode', 'except']);

export function collectUnreadManifestKeys(entry: unknown): string[] {
  if (!isRecord(entry)) {
    return [];
  }

  const unread = Object.keys(entry).filter((key) => !entryKeys.has(key));
  const files: unknown = entry['files'];

  if (!Array.isArray(files)) {
    return unread;
  }

  const unreadFileKeys = files.flatMap((file: unknown, index) =>
    isRecord(file)
      ? Object.keys(file)
          .filter((key) => !fileKeys.has(key))
          .map((key) => `files[${index}].${key}`)
      : [],
  );

  return [...unread, ...unreadFileKeys];
}

if (import.meta.main) {
  const manifest: unknown = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8'));
  const entries: unknown[] = Array.isArray(manifest) ? manifest : [];
  const records = entries.filter((entry) => isRecord(entry));

  writeStdout(
    records
      .flatMap((entry) =>
        collectUnreadManifestKeys(entry).map((key) => `${String(entry['name'])}\t${key}\n`),
      )
      .join(''),
  );
}
