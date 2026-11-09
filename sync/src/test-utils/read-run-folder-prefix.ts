import { readlinkSync } from 'node:fs';

export interface PIDNamespaceSource {
  readonly platform: NodeJS.Platform;

  readonly readLink: (path: string) => string;
}

const hostSource: PIDNamespaceSource = { platform: process.platform, readLink: readlinkSync };

export function readRunFolderPrefix(name: string, source = hostSource): string {
  return `${name}pid${process.pid}-ns${readPIDNamespace(source)}-`;
}

const namespaceLinkPattern = /^pid:\[(?<inode>\d+)\]$/u;

function readPIDNamespace(source: PIDNamespaceSource): string {
  // Only Linux has PID namespaces, so elsewhere every process shares one.
  if (source.platform !== 'linux') {
    return 'host';
  }

  try {
    return (
      namespaceLinkPattern.exec(source.readLink('/proc/self/ns/pid'))?.groups?.['inode'] ??
      'unknown'
    );
  } catch {
    return 'unknown';
  }
}
