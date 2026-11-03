import { readlinkSync } from 'node:fs';

export function readRunFolderPrefix(name: string): string {
  return `${name}pid${process.pid}-ns${readPIDNamespace()}-`;
}

const namespaceLinkPattern = /^pid:\[(?<inode>\d+)\]$/u;

function readPIDNamespace(): string {
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
