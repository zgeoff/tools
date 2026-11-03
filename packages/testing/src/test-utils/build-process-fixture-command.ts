import { join } from 'node:path';

// The command that runs the fixture program of the run and start tests.
export function buildProcessFixtureCommand(): string[] {
  return ['bun', join(import.meta.dir, 'process-fixture.ts')];
}
