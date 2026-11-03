import { readPIDNamespace } from '../test-cleanup/read-pid-namespace.ts';

export function readRunFolderPrefix(name: string): string {
  return `${name}pid${process.pid}-ns${readPIDNamespace()}-`;
}
