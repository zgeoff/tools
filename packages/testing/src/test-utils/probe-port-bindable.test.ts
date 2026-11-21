import { expect, test } from 'bun:test';
import { probePortBindable } from './probe-port-bindable.ts';

test('it reports a port that nothing listens on', () => {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: () => {
        // The listener is never read from.
      },
    },
  });

  const port = listener.port;

  listener.stop(true);

  expect(probePortBindable(port)).toBeTrue();
});

test('it reports a port that a listener holds', () => {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: () => {
        // The listener is never read from.
      },
    },
  });

  const isBindable = probePortBindable(listener.port);

  listener.stop(true);

  expect(isBindable).toBeFalse();
});
