import { basename } from 'node:path';

export function toBenchName(file: string): string {
  return basename(file, '.bench.ts');
}
