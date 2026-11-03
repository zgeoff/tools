import { expect, test } from 'bun:test';
import { collectUnreadManifestKeys } from './collect-unread-manifest-keys.ts';

test('it returns no key for an entry that holds every key of the manifest format', () => {
  const unread = collectUnreadManifestKeys({
    name: 'kettle',
    description: 'The kettle script',
    optIn: true,
    build: 'true',
    scripts: { boil: 'bun kettle.ts' },
    packages: ['zod'],
    files: [
      {
        repo: 'zgeoff/tools',
        source: 'sync/kettle.ts',
        target: 'scripts/kettle.ts',
        mode: '0755',
        except: ['acme/teapot'],
      },
    ],
  });

  expect(unread).toStrictEqual([]);
});

test('it names each entry key and file key these scripts do not read, with the file index', () => {
  const unread = collectUnreadManifestKeys({
    name: 'kettle',
    description: 'The kettle script',
    schedule: 'daily',
    files: [
      { source: 'sync/kettle.ts', target: 'scripts/kettle.ts' },
      { source: 'skills/kettle/SKILL.md', target: '.claude/skills/kettle/SKILL.md', ref: 'v2' },
    ],
  });

  expect(unread).toStrictEqual(['schedule', 'files[1].ref']);
});
