import { expect, test } from 'bun:test';
import { parseSyncEntries } from './parse-sync-entries.ts';

test('it reads each entry with its defaults for build and optIn', () => {
  const entries = parseSyncEntries([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    },
    {
      name: 'hook-demo',
      description: 'The demo hook',
      files: [{ source: 'sync/run.sh', target: 'run.sh', mode: '0755', except: ['Kettle'] }],
      build: 'bun install',
      optIn: true,
      scripts: { 'check:demo': 'true' },
    },
  ]);

  expect(entries).toStrictEqual([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      build: '',
      optIn: false,
    },
    {
      name: 'hook-demo',
      description: 'The demo hook',
      files: [{ source: 'sync/run.sh', target: 'run.sh', mode: '0755', except: ['Kettle'] }],
      build: 'bun install',
      optIn: true,
    },
  ]);
});

test('it reads what it wrote, so the sync job reads the entries the prepare job picked', () => {
  const entries = parseSyncEntries([
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      build: 'true',
      optIn: false,
    },
  ]);

  // ENTRIES crosses from the prepare job to the sync job as JSON text.
  const text = JSON.stringify(entries);
  const value: unknown = JSON.parse(text);

  expect(parseSyncEntries(value)).toStrictEqual(entries);
});

test.each([
  ['an object in place of a list', { name: 'editorconfig' }],
  ['an entry with no name', [{ description: 'The editor config', files: [] }]],
  ['an entry with no description', [{ name: 'editorconfig', files: [] }]],
  ['an entry with no file list', [{ name: 'editorconfig', description: 'The editor config' }]],
  [
    'an entry whose build is no string',
    [{ name: 'editorconfig', description: 'The editor config', files: [], build: 3 }],
  ],
  [
    'an entry whose optIn is no boolean',
    [{ name: 'editorconfig', description: 'The editor config', files: [], optIn: 'yes' }],
  ],
  [
    'a file with no target',
    [{ name: 'editorconfig', description: 'The editor config', files: [{ source: 'a' }] }],
  ],
  [
    'a file whose mode is no string',
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'a', target: 'b', mode: 644 }],
      },
    ],
  ],
  [
    'a file whose except is no list of names',
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'a', target: 'b', except: 'kettle' }],
      },
    ],
  ],
])('it refuses %s', (_label, value) => {
  expect(parseSyncEntries(value)).toBeNull();
});
