export interface PIDNamespaceSource {
  readonly platform: NodeJS.Platform;

  readonly readLink: (path: string) => string;
}

const namespaceLinkPattern = /^pid:\[(?<inode>\d+)\]$/u;

export function readPIDNamespace(source: PIDNamespaceSource): string {
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
