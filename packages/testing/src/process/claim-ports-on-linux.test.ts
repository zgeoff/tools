import { expect, test } from 'bun:test';
import { probePortHeld } from '../test-utils/probe-port-held.ts';
import { claimPortsOnLinux } from './claim-ports-on-linux.ts';

test.skipIf(process.platform !== 'linux')('it skips a port that the host lists as busy', () => {
  const holds = claimPortsOnLinux(1, { busyPorts: new Set([10_000]), ephemeralStart: 10_002 });

  for (const hold of holds) {
    hold.release();
  }

  expect(holds.map((hold) => hold.port)).toStrictEqual([10_001]);
});

test.skipIf(process.platform !== 'linux')(
  'it holds each port with an abstract socket',
  async () => {
    const holds = claimPortsOnLinux(2);

    const held = await Promise.all(holds.map((hold) => probePortHeld(hold.port)));

    for (const hold of holds) {
      hold.release();
    }

    expect(held).toStrictEqual([true, true]);
  },
);

test.skipIf(process.platform !== 'linux')('it throws when no port in the range is free', () => {
  expect(() =>
    claimPortsOnLinux(1, { busyPorts: new Set([10_000]), ephemeralStart: 10_001 }),
  ).toThrow('found no free port below 10001');
});
