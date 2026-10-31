import { expect, test } from 'bun:test';
import { buildChexPackRun } from './build-chex-pack-run.ts';

test("it places the run's pack in chex's own cache folder, under the host name and the run ID", () => {
  const run = buildChexPackRun('/work/notes', 'desk-7', '4120');

  expect(run).toStrictEqual({
    runsDir: '/work/notes/packages/chex/node_modules/.cache/chex-e2e/desk-7',
    runDir: '/work/notes/packages/chex/node_modules/.cache/chex-e2e/desk-7/4120',
    tarballPath: '/work/notes/packages/chex/node_modules/.cache/chex-e2e/desk-7/4120/chex.tgz',
    packageDir: '/work/notes/packages/chex/node_modules/.cache/chex-e2e/desk-7/4120/package',
  });
});
