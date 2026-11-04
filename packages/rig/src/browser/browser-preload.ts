// A cold Chrome start on a fresh CI runner can run past the test timeout, so the preload starts
// Chrome before the first test. Bun spawns one Chrome per process, on the options of the first
// view, and every later view in the process, in every file, reuses it.

import { afterAll } from 'bun:test';
import { hostname } from 'node:os';
import { systemClock } from '../system-clock.ts';
import { laneFiles } from './lane-files.ts';
import { readProcessTable } from './read-process-table.ts';
import { startBrowser } from './start-browser.ts';
import { stopDescendantProcesses } from './stop-descendant-processes.ts';

// Chrome's helper processes outlive the `bun test` that starts them, and diet then keeps its cgroup
// for them, so the preload stops them after the last file.
afterAll(() =>
  stopDescendantProcesses({
    rootPID: process.pid,
    deadlineMs: 5000,
    clock: systemClock,
    readProcessTable,
    signalProcess: process.kill.bind(process),
  }),
);

await startBrowser({
  // The lane starts each test process in the repo's root.
  repoRoot: process.cwd(),
  hostName: hostname(),
  environment: process.env,

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
