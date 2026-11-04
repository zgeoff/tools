import { expect, test } from 'bun:test';
import { buildProcessEntry } from '../test-utils/build-process-entry.ts';
import { collectDescendantPIDs } from './collect-descendant-pids.ts';

test("it collects the root's children and their children, and leaves out every other process", () => {
  const table = [
    buildProcessEntry(4100, 1),
    buildProcessEntry(4120, 4100),
    buildProcessEntry(4121, 4100),
    buildProcessEntry(4130, 4120),
    buildProcessEntry(4140, 4130),
    buildProcessEntry(5200, 1),
    buildProcessEntry(5210, 5200),
  ];

  expect(collectDescendantPIDs(table, 4100)).toStrictEqual([4120, 4121, 4130, 4140]);
});

test('it collects nothing for a root that has no child', () => {
  expect(
    collectDescendantPIDs([buildProcessEntry(4100, 1), buildProcessEntry(5200, 1)], 4100),
  ).toBeEmpty();
});

test('it collects each process once, and never the root, when the listing holds a cycle', () => {
  const table = [
    buildProcessEntry(4100, 4120),
    buildProcessEntry(4120, 4100),
    buildProcessEntry(4130, 4120),
  ];

  expect(collectDescendantPIDs(table, 4100)).toStrictEqual([4120, 4130]);
});
