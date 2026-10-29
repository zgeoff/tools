import type { SyncEntry } from '../scripts/repo-sync/parse-sync-entries.ts';

// The sync's outputs are pinned as golden text, so every default is fixed.
export function buildMockSyncEntry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    build: '',
    optIn: false,
    scripts: {},
    ...overrides,
  };
}
