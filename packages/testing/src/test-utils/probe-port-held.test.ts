import { expect, test } from 'bun:test';
import { probePortHeld } from './probe-port-held.ts';

test('it reports a port whose abstract socket is bound', async () => {
  const listener = Bun.listen({
    unix: '\0zgeoff-testing-port-45123',
    socket: {
      data: () => {
        // The listener is never read from.
      },
    },
  });

  const isHeld = await probePortHeld(45_123);

  listener.stop(true);

  expect(isHeld).toBeTrue();
});

test('it reports a port whose abstract socket is free', async () => {
  const isHeld = await probePortHeld(45_124);

  expect(isHeld).toBeFalse();
});
