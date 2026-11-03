import { expect, test } from 'bun:test';
import { parseCacheEntry } from './parse-cache-entry.ts';

test('it parses the template, the readers and a build folder of the name', () => {
  const entries = [
    'notes-0123456789abcdef',
    'notes-0123456789abcdef.readers',
    'notes-0123456789abcdef.building-5f1c-42aa',
  ].map((entry) => parseCacheEntry('notes', entry));

  expect(entries).toStrictEqual([
    { kind: 'template', templateName: 'notes-0123456789abcdef' },
    { kind: 'readers', templateName: 'notes-0123456789abcdef' },
    { kind: 'build', templateName: 'notes-0123456789abcdef' },
  ]);
});

test('it parses no entry of a name that starts with the name, and no lock file', () => {
  const entries = [
    'notes.lock',
    'notes-bundle.lock',
    'notes-bundle-0123456789abcdef',
    'notes-bundle-0123456789abcdef.readers',
    'notes-bundle-0123456789abcdef.building-5f1c',
    'notes-cafe.lock',
    'notes-0123456789abcdef.partial',
  ].map((entry) => parseCacheEntry('notes', entry));

  expect(entries).toStrictEqual([null, null, null, null, null, null, null]);
});
