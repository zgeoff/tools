import { join } from 'node:path';

// The command that runs the interactive fixture program.
export function buildCLIFixtureCommand(): string[] {
  return ['bun', join(import.meta.dir, 'cli-fixture.ts')];
}
