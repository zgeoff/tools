import { expect, onTestFinished, test } from 'bun:test';
import { probePortBindable } from '../test-utils/probe-port-bindable.ts';
import { probePortHeld } from '../test-utils/probe-port-held.ts';
import { claimFreePorts } from './claim-free-ports.ts';

test('it hands out the claimed ports one by one and refuses a take past the count', () => {
  const ports = claimFreePorts(2);
  const first = ports.take();
  const second = ports.take();

  expect(first).not.toBe(second);
  expect(() => ports.take()).toThrow('only 2 free ports were asked for');
});

test('it claims ports that a program can bind', () => {
  const ports = claimFreePorts(3);
  const claimed = [ports.take(), ports.take(), ports.take()];

  expect(claimed.map((port) => probePortBindable(port))).toStrictEqual([true, true, true]);
});

test('it claims distinct ports across calls', () => {
  const first = claimFreePorts(5);
  const second = claimFreePorts(5);
  const claimed = Array.from({ length: 5 }, () => [first.take(), second.take()]).flat();

  expect(new Set(claimed).size).toBe(10);
});

test.skipIf(process.platform !== 'linux')(
  'it claims each port from below the start of the ephemeral range',
  async () => {
    const range = await Bun.file('/proc/sys/net/ipv4/ip_local_port_range').text();

    const ephemeralStart = Number(range.trim().split(/\s+/u)[0]);
    const ports = claimFreePorts(20);
    const claimed = Array.from({ length: 20 }, () => ports.take());

    expect(claimed).toSatisfyAll((port: number) => port < ephemeralStart);
  },
);

test.skipIf(process.platform !== 'linux')(
  'it keeps another process out of a claimed port',
  async () => {
    const ports = claimFreePorts(1);

    const isHeld = await probePortHeld(ports.take());

    expect(isHeld).toBeTrue();
  },
);

test.skipIf(process.platform !== 'linux')(
  'it lets go of a port when the claim is released',
  async () => {
    const ports = claimFreePorts(1);
    const port = ports.take();

    ports.release();

    const isHeld = await probePortHeld(port);

    expect(isHeld).toBeFalse();
  },
);

test.skipIf(process.platform !== 'linux')('it releases the claim after the test', () => {
  const ports = claimFreePorts(1);
  const port = ports.take();

  onTestFinished(async () => {
    const isHeld = await probePortHeld(port);

    expect(isHeld).toBeFalse();
  });
});

test.skipIf(process.platform !== 'linux')(
  'it keeps a manual claim past the end of the test, until the caller releases it',
  () => {
    const ports = claimFreePorts(1, { cleanup: 'manual' });
    const port = ports.take();

    onTestFinished(async () => {
      const isHeld = await probePortHeld(port);

      ports.release();

      expect(isHeld).toBeTrue();
    });
  },
);
