import { expect, test } from 'bun:test';
import { collectTemplateGroups } from './collect-template-groups.ts';

test.each([
  {
    title: 'a template with its marker and lock',
    entries: ['site-0123456789abcdef', 'site-0123456789abcdef.used', 'site-0123456789abcdef.lock'],
    groups: [{ folder: 'site-0123456789abcdef', leftovers: [] }],
  },
  {
    title: 'a lock with no template',
    entries: ['site-0123456789abcdef.lock'],
    groups: [{ folder: 'site-0123456789abcdef', leftovers: [] }],
  },
  {
    title: 'a staging folder',
    entries: ['site-0123456789abcdef.staging-42-a'],
    groups: [
      { folder: 'site-0123456789abcdef', leftovers: ['site-0123456789abcdef.staging-42-a'] },
    ],
  },
  {
    title: 'a template with an empty name',
    entries: ['-0123456789abcdef', '-0123456789abcdef.used'],
    groups: [{ folder: '-0123456789abcdef', leftovers: [] }],
  },
  {
    title: 'a name that holds hyphens and hex',
    entries: ['data-0c2d4753-01e3140c-63e7748db2d550b7.used'],
    groups: [{ folder: 'data-0c2d4753-01e3140c-63e7748db2d550b7', leftovers: [] }],
  },
  {
    title: 'none of the entries that are not the cache’s',
    entries: ['notes.txt', 'site-0123', 'site-0123456789ABCDEF'],
    groups: [],
  },
])('it groups $title', (row) => {
  expect(collectTemplateGroups(row.entries)).toStrictEqual(row.groups);
});
