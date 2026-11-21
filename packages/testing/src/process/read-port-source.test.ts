import { expect, test } from 'bun:test';
import { readPortSource } from './read-port-source.ts';

test.skipIf(process.platform !== 'linux')('it lists the port of a socket that listens', () => {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: () => {
        // The listener is never read from.
      },
    },
  });

  const source = readPortSource();

  listener.stop(true);

  expect(source.busyPorts.has(listener.port)).toBeTrue();
});

test.skipIf(process.platform !== 'linux')('it reads the start of the ephemeral range', async () => {
  const range = await Bun.file('/proc/sys/net/ipv4/ip_local_port_range').text();

  const source = readPortSource();

  expect(source.ephemeralStart).toBe(Number(range.trim().split(/\s+/u)[0]));
});
