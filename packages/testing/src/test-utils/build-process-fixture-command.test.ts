import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildProcessFixtureCommand } from './build-process-fixture-command.ts';

test('it points at the fixture program that sits beside it', () => {
  expect(buildProcessFixtureCommand()).toStrictEqual([
    'bun',
    join(import.meta.dir, 'process-fixture.ts'),
  ]);
});
