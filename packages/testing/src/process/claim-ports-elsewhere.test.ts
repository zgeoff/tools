import { expect, test } from 'bun:test';
import { probePortBindable } from '../test-utils/probe-port-bindable.ts';
import { claimPortsElsewhere } from './claim-ports-elsewhere.ts';

test('it picks the number of distinct ports that it is asked for', () => {
  const holds = claimPortsElsewhere(4);

  expect(new Set(holds.map((hold) => hold.port)).size).toBe(4);
});

test('it holds nothing, so a program can bind each port', () => {
  const holds = claimPortsElsewhere(3);

  expect(holds.map((hold) => probePortBindable(hold.port))).toStrictEqual([true, true, true]);
});
