import { expect, test } from 'bun:test';
import { buildBrowserRun } from './build-browser-run.ts';

test("it puts the run's folder, its build and its profiles in the repo's git-ignored cache, under the host's name", () => {
  const run = buildBrowserRun('/work/notes-app', 'build-box', '4417');

  expect(run).toStrictEqual({
    runID: '4417',
    runsDir: '/work/notes-app/node_modules/.cache/browser-lane/build-box',
    runDir: '/work/notes-app/node_modules/.cache/browser-lane/build-box/4417',
    buildDir: '/work/notes-app/node_modules/.cache/browser-lane/build-box/4417/build',
    profilesDir: '/work/notes-app/node_modules/.cache/browser-lane/build-box/4417/profiles',
  });
});
