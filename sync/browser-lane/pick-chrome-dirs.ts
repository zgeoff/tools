import { join } from 'node:path';
import type { BrowserRun } from './build-browser-run.ts';

export interface ChromeDirs {
  readonly privateDir: string;

  readonly runDir: string;
}

// Chrome binds its singleton socket at <TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket and
// stops at startup when that path passes the 107 bytes a Unix socket address holds.
const socketPathMaxBytes = 107;
const socketSuffix = '/org.chromium.Chromium.XXXXXX/SingletonSocket';

// Every user of a host shares /tmp, so each user's runs get a parent folder of their own.
export function pickChromeDirs(tmpdir: string, userID: number, run: BrowserRun): ChromeDirs {
  const privateName = `browser-lane-chrome-${userID}`;
  const preferred = buildChromeDirs(join(tmpdir, privateName), run.runID);

  return Buffer.byteLength(`${preferred.runDir}${socketSuffix}`) <= socketPathMaxBytes
    ? preferred
    : buildChromeDirs(join('/tmp', privateName), run.runID);
}

function buildChromeDirs(privateDir: string, runID: string): ChromeDirs {
  return { privateDir, runDir: join(privateDir, runID) };
}
