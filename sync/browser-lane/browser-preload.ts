// A cold Chrome start on a fresh CI runner can run past the test timeout, so the preload starts
// Chrome before the file's first test. Bun spawns one Chrome per process, on the options of the
// first view, and every later view in the file reuses it.

import { hostname } from 'node:os';
import { laneFiles } from './lane-files.ts';
import { startBrowser } from './start-browser.ts';

await startBrowser({
  // The lane starts each test process in the repo's root.
  repoRoot: process.cwd(),
  hostName: hostname(),
  environment: process.env,

  // `bun test --parallel=1` stops each file's Chrome and loads this module again for the next
  // file. A new Chrome on the last one's profile can start before the last one lets go of it.
  profileName: crypto.randomUUID(),
  readDirNames: laneFiles.readDirNames,
  openView: openChromeView,
});

// Bun.WebView never removes the profile it makes under `bun test` (oven-sh/bun#45389), so the view
// takes one in the run's folder, which the lane removes. The sandbox needs user namespaces that a
// container lacks. A killed Chrome leaves its shared memory files, which go to the lane's TMPDIR.
async function openChromeView(profileDir: string): Promise<void> {
  const view = new Bun.WebView({
    backend: { type: 'chrome', url: false, argv: ['--no-sandbox', '--disable-dev-shm-usage'] },
    dataStore: { directory: profileDir },
  });

  try {
    await view.navigate('about:blank');
  } finally {
    view.close();
  }
}
