import { expect, test } from 'bun:test';
import { buildProcessEntry } from './build-process-entry.ts';

test('it builds a sleeping process with its parent', () => {
  expect(buildProcessEntry(4120, 4100)).toStrictEqual({
    pid: 4120,
    parentID: 4100,
    groupID: 4100,
    state: 'S',
  });
});

test('it builds a process in the state it gets', () => {
  expect(buildProcessEntry(4120, 4100, 'Z')).toStrictEqual({
    pid: 4120,
    parentID: 4100,
    groupID: 4100,
    state: 'Z',
  });
});
