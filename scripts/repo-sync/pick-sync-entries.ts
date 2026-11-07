import { collectNeededNames } from './collect-needed-names.ts';
import type { SyncEntry } from './parse-sync-entries.ts';

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

  const names = new Set(selection.manifest.map((entry) => entry.name));

  const unknownNeeds = selection.manifest.flatMap((entry) =>
    entry.needs.filter((name) => !names.has(name)).map((name) => `${entry.name} needs ${name}`),
  );

  if (unknownNeeds.length > 0) {
    return {
      kind: 'refused',
      message: `needs lists no manifest entry: ${formatLogNames(unknownNeeds)}`,
    };
  }

  const requested = selection.manifest
    .filter((entry) => !skip.includes(entry.name))
    .filter((entry) => !entry.optIn || include.includes(entry.name));

  const taken = collectNeededNames(selection.manifest, requested, skip);

  return { kind: 'picked', entries: selection.manifest.filter((entry) => taken.has(entry.name)) };
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
