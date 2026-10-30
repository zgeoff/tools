import { expect, test } from 'bun:test';
import type { ProcessEntry } from './read-process-table.ts';
import { readProcessTable } from './read-process-table.ts';

test('it lists the process that reads it, with its group and its state', () => {
  const table = readProcessTable();

  expect(table).toPartiallyContain({ pid: process.pid, groupID: expect.any(Number) });
  expect(table).toSatisfyAll((entry: ProcessEntry) => entry.state !== '');
});
