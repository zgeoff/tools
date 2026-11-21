import { readFileSync } from 'node:fs';
import { lowestClaimedPort } from './constants.ts';

export interface PortSource {
  // The local port of each socket that /proc/net/tcp and /proc/net/tcp6 list, in any state.
  readonly busyPorts: ReadonlySet<number>;

  // The first port of the kernel's ephemeral range, which outgoing connections use.
  readonly ephemeralStart: number;
}

// What claimPortsOnLinux needs to know about the ports of this host.
export function readPortSource(): PortSource {
  return { busyPorts: readBusyPorts(), ephemeralStart: readEphemeralStart() };
}

function readBusyPorts(): Set<number> {
  const ports = new Set<number>();

  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    for (const line of readLines(table).slice(1)) {
      const [, local] = line.trim().split(/\s+/u);
      const hex = local?.split(':')[1];

      if (hex !== undefined) {
        ports.add(Number.parseInt(hex, 16));
      }
    }
  }

  return ports;
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n');
  } catch {
    return [];
  }
}

const defaultEphemeralStart = 32_768;

function readEphemeralStart(): number {
  const [range = ''] = readLines('/proc/sys/net/ipv4/ip_local_port_range');
  const start = Number(range.trim().split(/\s+/u)[0]);

  return Number.isInteger(start) && start > lowestClaimedPort ? start : defaultEphemeralStart;
}
