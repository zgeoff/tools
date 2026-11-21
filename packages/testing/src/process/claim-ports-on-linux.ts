import type { SocketListener } from 'bun';
import { lowestClaimedPort } from './constants.ts';
import { readPortSource } from './read-port-source.ts';
import type { PortSource } from './read-port-source.ts';
import type { PortHold } from './types.ts';

const maxPicksPerPort = 200;

// Takes each port from below the kernel's ephemeral range, and holds it with an abstract unix
// socket named after the port, which is the same name for every process in the network namespace.
// `source` stands in for what the host says about its ports, for this function's own tests.
export function claimPortsOnLinux(
  count: number,
  source: PortSource = readPortSource(),
): PortHold[] {
  const holds: PortHold[] = [];
  const maxPicks = maxPicksPerPort * count;
  const span = source.ephemeralStart - lowestClaimedPort;

  try {
    for (let picks = 0; holds.length < count; picks += 1) {
      if (picks >= maxPicks) {
        throw new Error(`found no free port below ${source.ephemeralStart} after ${picks} picks`);
      }

      const port = lowestClaimedPort + Math.floor(Math.random() * span);
      const listener = source.busyPorts.has(port) ? null : listenOnAbstractSocket(port);

      if (listener !== null) {
        holds.push({ port, release: () => listener.stop(true) });
      }
    }

    return holds;
  } catch (error) {
    for (const hold of holds) {
      hold.release();
    }

    throw error;
  }
}

function listenOnAbstractSocket(port: number): SocketListener<undefined> | null {
  try {
    return Bun.listen({
      unix: `\0zgeoff-testing-port-${port}`,
      socket: {
        data: (socket) => {
          socket.end();
        },
      },
    });
  } catch {
    // Another claim holds the port.
    return null;
  }
}
