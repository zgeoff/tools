import { expect, test } from 'bun:test';
import { buildRigPackRun } from './build-rig-pack-run.ts';

test("it places the run's pack in rig's own cache folder, under the host name and the run ID, and the build lock above every host", () => {
  const run = buildRigPackRun('/work/notes', 'desk-7', '4120');

  expect(run).toStrictEqual({
    lockPath: '/work/notes/packages/rig/node_modules/.cache/rig-e2e/build.lock',
    runsDir: '/work/notes/packages/rig/node_modules/.cache/rig-e2e/desk-7',
    runDir: '/work/notes/packages/rig/node_modules/.cache/rig-e2e/desk-7/4120',
    tarballPath: '/work/notes/packages/rig/node_modules/.cache/rig-e2e/desk-7/4120/rig.tgz',
    packageDir: '/work/notes/packages/rig/node_modules/.cache/rig-e2e/desk-7/4120/package',
  });
});
