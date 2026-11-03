import { readlinkSync } from 'node:fs';
import type { PIDNamespaceSource } from '../test-cleanup/read-pid-namespace.ts';
import { readPIDNamespace } from '../test-cleanup/read-pid-namespace.ts';

const hostSource: PIDNamespaceSource = { platform: process.platform, readLink: readlinkSync };

export function readRunFolderPrefix(name: string, source = hostSource): string {
  return `${name}pid${process.pid}-ns${readPIDNamespace(source)}-`;
}
