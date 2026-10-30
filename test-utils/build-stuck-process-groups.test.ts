import { expect, test } from 'bun:test';
import { buildStuckProcessGroups } from './build-stuck-process-groups.ts';

test('it finds the group running after every signal, and records each signal', () => {
  const groups = buildStuckProcessGroups();

  groups.signalGroup(4417, 'SIGTERM');
  groups.signalGroup(4417, 'SIGKILL');

  expect(groups.probeGroup(4417)).toBeTrue();

  expect(groups.signalGroup.mock.calls).toStrictEqual([
    [4417, 'SIGTERM'],
    [4417, 'SIGKILL'],
  ]);
});
