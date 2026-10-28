import type { SyncEntry } from './parse-sync-entries.ts';
import type { SyncFile } from './select-sync-files.ts';

export interface SyncEntrySelection {
  readonly manifest: readonly SyncEntry[];

  // Comma-separated entry names, as the skip and include inputs hold them.
  readonly skip: string;
  readonly include: string;
}

export type PickedSyncEntries =
  | {
      readonly kind: 'picked';
      readonly entries: readonly SyncEntry[];
      readonly workflows: boolean;
    }
  | { readonly kind: 'refused'; readonly message: string };

export function pickSyncEntries(selection: SyncEntrySelection): PickedSyncEntries {
  const skip = parseEntryNames(selection.skip);
  const include = parseEntryNames(selection.include);

  const optIn = new Set(
    selection.manifest.filter((entry) => entry.optIn).map((entry) => entry.name),
  );

  const unknown = include.filter((name) => !optIn.has(name));

  if (unknown.length > 0) {
    return {
      kind: 'refused',
      message: `include lists no opt-in manifest entry: ${formatLogNames(unknown)}`,
    };
  }

  const both = include.filter((name) => skip.includes(name));

  if (both.length > 0) {
    return { kind: 'refused', message: `skip and include both list: ${formatLogNames(both)}` };
  }

  const entries = selection.manifest
    .filter((entry) => !skip.includes(entry.name))
    .filter((entry) => !entry.optIn || include.includes(entry.name));

  return {
    kind: 'picked',
    entries,
    workflows: entries.some((entry) => hasWorkflowTarget(entry.files)),
  };
}

function parseEntryNames(list: string): string[] {
  return list
    .split(',')
    .map((name) => name.replaceAll(/\s/gu, ''))
    .filter((name) => name !== '');
}

// A name can come from a caller's input, and a line that starts with `::` is a workflow command,
// so the colons go.
function formatLogNames(names: readonly string[]): string {
  return names.join(', ').replaceAll(':', ' ');
}

function hasWorkflowTarget(files: readonly SyncFile[]): boolean {
  return files.some((file) => file.target.startsWith('.github/workflows/'));
}
