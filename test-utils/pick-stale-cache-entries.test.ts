import { expect, test } from 'bun:test';
import { pickStaleCacheEntries } from './pick-stale-cache-entries.ts';

test('it picks the templates of other keys that no reader uses, their readers and every build folder', () => {
  const stale = pickStaleCacheEntries({
    name: 'notes-bundle',
    templateName: 'notes-bundle-2222',
    entries: [
      'notes-bundle.lock',
      'notes-bundle-1111',
      'notes-bundle-1111.readers',
      'notes-bundle-2222',
      'notes-bundle-2222.readers',
      'notes-bundle-2222.building-5f1c',
      'notes-bundle-3333',
      'notes-bundle-3333.readers',
      'billing-bundle-1111',
    ],
    readTemplateNames: new Set(['notes-bundle-3333']),
  });

  expect(stale).toStrictEqual([
    'notes-bundle-1111',
    'notes-bundle-1111.readers',
    'notes-bundle-2222.building-5f1c',
  ]);
});
