import { expect, test } from 'bun:test';
import { buildBrowserRun } from './build-browser-run.ts';
import { findBrowserRun } from './find-browser-run.ts';

test('it finds the run that RIG_BROWSER_RUN_ID names', () => {
  const run = findBrowserRun('/work/notes-app', 'build-box', { RIG_BROWSER_RUN_ID: '4417' });

  expect(run).toStrictEqual(buildBrowserRun('/work/notes-app', 'build-box', '4417'));
});

test.each([
  ['unset', {}],
  ['empty', { RIG_BROWSER_RUN_ID: '' }],
])('it finds no run when RIG_BROWSER_RUN_ID is %s', (_, environment) => {
  expect(findBrowserRun('/work/notes-app', 'build-box', environment)).toBeNull();
});
