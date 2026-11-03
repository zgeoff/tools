import { readlinkSync } from 'node:fs';

const namespaceLinkPattern = /^pid:\[(?<inode>\d+)\]$/u;

export function readPIDNamespace(): string {
  // Only Linux has PID namespaces, so elsewhere every process shares one.
  if (process.platform !== 'linux') {
    return 'host';
  }

  try {
    return (
      namespaceLinkPattern.exec(readlinkSync('/proc/self/ns/pid'))?.groups?.['inode'] ?? 'unknown'
    );
  } catch {
    return 'unknown';
  }
}
