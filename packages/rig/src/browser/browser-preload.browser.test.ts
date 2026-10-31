import { expect, onTestFinished, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { findBrowserRun } from './find-browser-run.ts';

test("it starts Chrome on a profile folder inside the run's folder", async () => {
  const run = findBrowserRun(process.cwd(), hostname(), process.env);

  invariant(run);

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  const profiles = await readdir(run.profilesDir);

  const profileEntries = await Promise.all(
    profiles.map((profile) => readdir(join(run.profilesDir, profile))),
  );

  expect(profileEntries).toSatisfyAny((entries: readonly string[]) => entries.length > 0);
});

test('it runs the file under the TMPDIR the lane picks for Chrome', () => {
  expect(process.env['TMPDIR']).toMatch(/\/rig-browser-\d+\/[\da-f]{8}\/\d+$/u);
});
