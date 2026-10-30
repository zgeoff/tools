import { expect, test } from 'bun:test';
import { buildBrowserRun } from './build-browser-run.ts';
import { buildLaneEnvironments } from './build-lane-environments.ts';

test("it gives the build and the tests the run's build folder, and the tests the run ID and Chrome's TMPDIR", () => {
  const run = buildBrowserRun('/work/notes-app', 'build-box', '4417');

  const environments = buildLaneEnvironments(
    { PATH: '/usr/bin' },
    run,
    '/tmp/rig-browser-1000/ab12/4417',
    true,
  );

  expect(environments).toStrictEqual({
    buildEnvironment: { PATH: '/usr/bin', RIG_BROWSER_BUILD_DIR: run.buildDir },
    testsEnvironment: {
      PATH: '/usr/bin',
      RIG_BROWSER_BUILD_DIR: run.buildDir,
      RIG_BROWSER_RUN_ID: '4417',
      TMPDIR: '/tmp/rig-browser-1000/ab12/4417',
    },
  });
});

test("it drops a build folder that the caller's environment names when the repo has no build", () => {
  const run = buildBrowserRun('/work/notes-app', 'build-box', '4417');

  const environments = buildLaneEnvironments(
    { PATH: '/usr/bin', RIG_BROWSER_BUILD_DIR: '/work/old-build' },
    run,
    '/tmp/rig-browser-1000/ab12/4417',
    false,
  );

  expect(environments.testsEnvironment).toStrictEqual({
    PATH: '/usr/bin',
    RIG_BROWSER_RUN_ID: '4417',
    TMPDIR: '/tmp/rig-browser-1000/ab12/4417',
  });
});
