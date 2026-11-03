import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildCLIFixtureCommand } from './build-cli-fixture-command.ts';

test('it points at the fixture program that sits beside it', () => {
  expect(buildCLIFixtureCommand()).toStrictEqual(['bun', join(import.meta.dir, 'cli-fixture.ts')]);
});
