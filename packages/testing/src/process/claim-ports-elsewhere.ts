import type { PortHold } from './types.ts';

// Asks the OS for a free port on the loopback address by binding port 0, and holds nothing, so
// another test can take the port before the program binds it.
export function claimPortsElsewhere(count: number): PortHold[] {
  const ports = new Set<number>();

  while (ports.size < count) {
    const listener = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        data: () => {
          // The listener only reads a port.
        },
      },
    });

    ports.add(listener.port);
    listener.stop(true);
  }

  return [...ports].map((port) => ({
    port,
    release: () => {
      // Nothing is held.
    },
  }));
}
