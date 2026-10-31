import { expect, test } from 'bun:test';
import { buildStubProcessProbe } from './build-stub-process-probe.ts';

test('it finds each process in the list live, and no other', () => {
  const probeProcess = buildStubProcessProbe([4417, 5120]);
  const live = [4417, 5120, 6001].map((processID) => probeProcess(processID));

  expect(live).toStrictEqual([true, true, false]);
});
