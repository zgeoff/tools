import { isRecord } from '../../packages/std/src/is-record.ts';

export interface SyncEntrySelection {
  readonly manifest: readonly Readonly<Record<string, unknown>>[];

  // Comma-separated entry names, as the skip and include inputs hold them.
  readonly skip: string;
  readonly include: string;
}

export type PickedSyncEntries =
  | {
      readonly kind: 'picked';
      readonly entries: readonly Readonly<Record<string, unknown>>[];
      readonly workflows: boolean;
    }
  | { readonly kind: 'refused'; readonly message: string };

export function pickSyncEntries(selection: SyncEntrySelection): PickedSyncEntries {
  const skip = parseEntryNames(selection.skip);
  const include = parseEntryNames(selection.include);

  const optIn = new Set(
    selection.manifest.filter((entry) => entry['optIn'] === true).map((entry) => entry['name']),
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
    .filter((entry) => !skip.some((name) => name === entry['name']))
    .filter((entry) => entry['optIn'] !== true || include.some((name) => name === entry['name']))
    .map((entry) => {
      const { optIn: _optIn, ...kept } = entry;

      return Object.assign(kept, { workflows: hasWorkflowTarget(entry['files']) });
    });

  return {
    kind: 'picked',
    entries,
    workflows: entries.some((entry) => entry.workflows),
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

function hasWorkflowTarget(files: unknown): boolean {
  return (
    Array.isArray(files) &&
    files.some(
      (file) =>
        isRecord(file) &&
        typeof file['target'] === 'string' &&
        file['target'].startsWith('.github/workflows/'),
    )
  );
}
