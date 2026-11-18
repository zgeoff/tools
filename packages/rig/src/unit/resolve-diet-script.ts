import { dirname, join } from 'node:path';

// diet is a dependency of this package, so its script resolves from here, whatever the repo's PATH
// holds.
export function resolveDietScript(): string {
  return join(dirname(Bun.resolveSync('@zgeoff/diet/package.json', import.meta.dir)), 'diet.sh');
}
