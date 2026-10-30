// The build:browser program of the stub build repo. It writes its process ID file first, so a
// test can stop its group before it reports its start, then starts a helper process and prints
// its start line. On SIGTERM it waits, then writes whether the run's folder still exists.

import { existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import type { StubBuildStart } from './stub-build-start.ts';

if (import.meta.main) {
  const parsed = parseArgs({
    options: { marker: { type: 'string' }, 'pid-file': { type: 'string' } },
  });

  const markerPath = parsed.values.marker;
  const pidPath = parsed.values['pid-file'];

  if (markerPath === undefined || pidPath === undefined) {
    throw new Error('the stub build needs --marker and --pid-file');
  }

  writeFileSync(pidPath, String(process.pid));

  const runDir = dirname(process.env['BROWSER_LANE_BUILD_DIR'] ?? '');

  process.on('SIGTERM', () => {
    setTimeout(() => {
      writeFileSync(markerPath, String(existsSync(runDir)));

      process.exit(143);
    }, 200);
  });

  const helper = Bun.spawn(['sleep', '30']);

  const start: StubBuildStart = {
    event: 'build-started',
    buildPid: process.pid,
    helperPid: helper.pid,
  };

  console.log(`${JSON.stringify(start)}\n`);

  setInterval(() => {}, 1000);
}
