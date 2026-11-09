import { expect, test } from 'bun:test';
import { buildSyncRowSplit } from './build-sync-row-split.ts';

test('it splits the rows into the taken and the excluded, each in its order', () => {
  const split = buildSyncRowSplit([
    { action: 'copy', source: 'sync/SKILL.md', target: 'SKILL.md', mode: '0644' },
    { action: 'skip', source: 'sync/pour.md', target: 'pour.md', mode: '0644' },
    { action: 'copy', source: 'sync/boil.sh', target: 'boil.sh', mode: '0755' },
  ]);

  expect(split.taken).toStrictEqual([
    { action: 'copy', source: 'sync/SKILL.md', target: 'SKILL.md', mode: '0644' },
    { action: 'copy', source: 'sync/boil.sh', target: 'boil.sh', mode: '0755' },
  ]);

  expect(split.excluded).toStrictEqual([
    { action: 'skip', source: 'sync/pour.md', target: 'pour.md', mode: '0644' },
  ]);
});

test('it returns two empty sides for no rows', () => {
  const split = buildSyncRowSplit([]);

  expect(split.taken).toStrictEqual([]);
  expect(split.excluded).toStrictEqual([]);
});
