import { join } from 'node:path';

// The base side runs from the same folder inside its checkout as the head side runs inside the
// repo, so both sides read the config and bench files of the same package.
export function buildBaseSideRoot(checkoutRoot: string, gitPrefix: string): string {
  return join(checkoutRoot, gitPrefix.replace(/\/$/u, ''));
}
