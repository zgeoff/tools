import { expect, test } from 'bun:test';
import { parseProcessListing } from './parse-process-listing.ts';

test('it reads the process ID, parent, group and state of each line', () => {
  expect(parseProcessListing('  410   1 410 Ss\n 522 410 410 R+\n', 900)).toStrictEqual([
    { pid: 410, parentID: 1, groupID: 410, state: 'Ss' },
    { pid: 522, parentID: 410, groupID: 410, state: 'R+' },
  ]);
});

test('it leaves out the ps process that makes the listing', () => {
  expect(parseProcessListing(' 410 1 410 Ss\n 900 410 410 R+\n', 900)).toStrictEqual([
    { pid: 410, parentID: 1, groupID: 410, state: 'Ss' },
  ]);
});

test('it skips a line with fewer than four columns', () => {
  expect(parseProcessListing(' 410 1 410\n\n', 900)).toStrictEqual([]);
});
