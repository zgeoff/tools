import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from './build-mock-sync-entry.ts';

test('it builds a default sync entry', () => {
  expect(buildMockSyncEntry()).toStrictEqual({
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    build: '',
    optIn: false,
  });
});

test('it applies overrides on top of the defaults', () => {
  const entry = buildMockSyncEntry({ name: 'workflow-demo', optIn: true });

  expect(entry).toStrictEqual({
    name: 'workflow-demo',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    build: '',
    optIn: true,
  });
});
